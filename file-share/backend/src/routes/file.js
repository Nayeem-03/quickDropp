import express from 'express';
import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import Analytics from '../models/Analytics.js';
import { getSignedDownloadUrl, deleteFromS3 } from '../utils/s3.js';
import geoip from 'geoip-lite';
import useragent from 'useragent';

const router = express.Router();

// Delete file from S3 and Link
const deleteFile = async (link) => {
    try {
        console.log(`🗑️ Deleting expired file: ${link.linkId} (${link.originalName})`);
        await deleteFromS3(link.s3Key);
        await link.deleteOne();
        console.log(`✅ File deleted successfully`);
    } catch (err) {
        console.error('Delete error:', err.message);
    }
};

// Get file info
router.get('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const link = await Link.findOne({ linkId: fileId });

        if (!link) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Custom validation method if we put it on Schema, or inline here
        if (link.isValid && !link.isValid()) { // Assuming we added isValid method or check manually
            if (link.expiresAt && new Date() > link.expiresAt) {
                await deleteFile(link);
                return res.status(410).json({ error: 'File has expired' });
            }
            if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
                await deleteFile(link);
                return res.status(410).json({ error: 'File limit reached' });
            }
        }

        // Manual check just in case Schema method isn't loaded
        const now = new Date();
        if (link.releaseDate && now < new Date(link.releaseDate)) {
            return res.status(403).json({ error: 'File not yet released', releaseDate: link.releaseDate });
        }
        if (link.expiresAt && now > link.expiresAt) {
            await deleteFile(link);
            return res.status(410).json({ error: 'File has expired' });
        }

        res.json({
            fileName: link.originalName,
            fileSize: link.size,
            mimeType: link.mimeType,
            expiresAt: link.expiresAt,
            selfDestruct: !!link.maxDownloads,
            passwordProtected: !!link.passwordHash
        });
    } catch (error) {
        console.error('File info error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Preview file (get presigned URL without incrementing download count)
router.post('/preview/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { password } = req.body;

        const link = await Link.findOne({ linkId: fileId });

        if (!link) {
            return res.status(404).json({ error: 'File not found' });
        }

        const now = new Date();

        // Check if file is released yet
        if (link.releaseDate && now < new Date(link.releaseDate)) {
            return res.status(403).json({
                error: 'File not yet released',
                releaseDate: link.releaseDate
            });
        }

        if (link.expiresAt && now > link.expiresAt) {
            await deleteFile(link);
            return res.status(410).json({ error: 'File has expired' });
        }

        if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
            await deleteFile(link);
            return res.status(410).json({ error: 'Limit reached' });
        }

        // Check password if protected
        if (link.passwordHash) {
            if (!password) {
                return res.status(401).json({ error: 'Password required' });
            }
            const valid = await bcrypt.compare(password, link.passwordHash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        // Generate short-lived presigned URL for preview (5 minutes)
        const previewUrl = await getSignedDownloadUrl(link.s3Key, link.originalName, 300);

        console.log(`👁️ Preview generated for ${fileId}(no download count increment)`);

        res.json({
            previewUrl,
            fileName: link.originalName,
            mimeType: link.mimeType
        });
    } catch (error) {
        console.error('Preview error:', error);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

// Verify password
router.post('/verify/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { password } = req.body;

        const link = await Link.findOne({ linkId: fileId });

        if (!link) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (!link.passwordHash) {
            return res.json({ valid: true });
        }

        const valid = await bcrypt.compare(password || '', link.passwordHash);

        if (!valid) {
            return res.status(401).json({ error: 'Invalid password', valid: false });
        }

        res.json({ valid: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get download URL (returns signed S3 URL)
router.post('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { password } = req.body;

        const link = await Link.findOne({ linkId: fileId });

        if (!link) {
            return res.status(404).json({ error: 'File not found' });
        }

        const now = new Date();

        // Check if file is released yet
        if (link.releaseDate && now < new Date(link.releaseDate)) {
            return res.status(403).json({
                error: 'File not yet released',
                releaseDate: link.releaseDate
            });
        }

        if (link.expiresAt && now > link.expiresAt) {
            await deleteFile(link);
            return res.status(410).json({ error: 'File has expired' });
        }

        if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
            await deleteFile(link);
            return res.status(410).json({ error: 'Limit reached' });
        }

        // Check password if protected
        if (link.passwordHash) {
            if (!password) {
                return res.status(401).json({ error: 'Password required' });
            }
            const valid = await bcrypt.compare(password, link.passwordHash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        // Track Analytics
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const geo = geoip.lookup(ip);
        const agent = useragent.parse(req.headers['user-agent']);

        // Better device detection
        const userAgentString = req.headers['user-agent'] || '';
        let deviceType = 'Desktop';
        if (/mobile/i.test(userAgentString)) deviceType = 'Mobile';
        if (/tablet|ipad/i.test(userAgentString)) deviceType = 'Tablet';

        // Extract OS
        let os = agent.os.toString() || 'Unknown';
        if (os === 'Other 0.0.0') {
            if (/Windows/i.test(userAgentString)) os = 'Windows';
            else if (/Mac OS/i.test(userAgentString)) os = 'macOS';
            else if (/Linux/i.test(userAgentString)) os = 'Linux';
            else if (/Android/i.test(userAgentString)) os = 'Android';
            else if (/iOS|iPhone|iPad/i.test(userAgentString)) os = 'iOS';
        }

        // Better browser detection
        let browser = 'Unknown Browser';
        if (/Edg\//i.test(userAgentString)) {
            browser = 'Edge';
        } else if (/Chrome/i.test(userAgentString) && !/Edg/i.test(userAgentString)) {
            browser = 'Chrome';
        } else if (/Firefox/i.test(userAgentString)) {
            browser = 'Firefox';
        } else if (/Safari/i.test(userAgentString) && !/Chrome/i.test(userAgentString)) {
            browser = 'Safari';
        } else if (/Opera|OPR/i.test(userAgentString)) {
            browser = 'Opera';
        } else {
            browser = agent.toAgent() || 'Unknown Browser';
        }

        // Log asynchronously
        new Analytics({
            linkId: link.linkId,
            ipAddress: ip,
            country: geo ? geo.country : 'Unknown',
            city: geo ? geo.city : 'Unknown',
            device: `${deviceType} (${os})`,
            browser: browser,
            userAgent: userAgentString
        }).save().catch(err => console.error('Analytics error:', err));

        // Increment download count
        link.downloadCount = (link.downloadCount || 0) + 1;
        await link.save();

        // Get signed URL from S3 using the MUTABLE s3Key
        const downloadUrl = await getSignedDownloadUrl(link.s3Key, link.originalName);

        // Handle self-destruct (Burn after read) logic
        // If maxDownloads is 1, and we just incremented to 1, effectively we should delete it.
        // But usually we want to let the user download it first. 
        // The previous code had a timeout. We can keep that or just let the next check fail.
        // Better: let the user download, but if they refresh, it's gone.
        // We already incremented count. Next check will fail.

        res.json({ downloadUrl, fileName: link.originalName });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

export default router;
