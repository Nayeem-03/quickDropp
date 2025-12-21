import express from 'express';
import bcrypt from 'bcryptjs';
import { getFileMetadata, deleteFileMetadata } from '../utils/storage.js';
import { getSignedDownloadUrl, deleteFromS3 } from '../utils/s3.js';

const router = express.Router();

// Check if file is expired
const isExpired = (metadata) => {
    if (!metadata.expiresAt) return false;
    return new Date(metadata.expiresAt) < new Date();
};

// Delete file from S3 and metadata
const deleteFile = async (fileId) => {
    try {
        await deleteFromS3(fileId);
        await deleteFileMetadata(fileId);
    } catch (err) {
        console.error('Delete error:', err.message);
    }
};

// Get file info
router.get('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await getFileMetadata(fileId);

        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (isExpired(metadata)) {
            await deleteFile(fileId);
            return res.status(410).json({ error: 'File has expired' });
        }

        res.json({
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            mimeType: metadata.mimeType,
            expiresAt: metadata.expiresAt,
            selfDestruct: metadata.selfDestruct,
            passwordProtected: !!metadata.passwordHash
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify password
router.post('/verify/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const { password } = req.body;

        const metadata = await getFileMetadata(fileId);

        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (!metadata.passwordHash) {
            return res.json({ valid: true });
        }

        const valid = await bcrypt.compare(password || '', metadata.passwordHash);

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

        const metadata = await getFileMetadata(fileId);

        if (!metadata || metadata.status !== 'completed') {
            return res.status(404).json({ error: 'File not found' });
        }

        if (isExpired(metadata)) {
            await deleteFile(fileId);
            return res.status(410).json({ error: 'File has expired' });
        }

        // Check password if protected
        if (metadata.passwordHash) {
            if (!password) {
                return res.status(401).json({ error: 'Password required' });
            }
            const valid = await bcrypt.compare(password, metadata.passwordHash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
        }

        // Get signed URL from S3
        const downloadUrl = await getSignedDownloadUrl(fileId, metadata.fileName);

        // Handle self-destruct
        if (metadata.selfDestruct) {
            // Delete after providing URL (give some time for download to start)
            setTimeout(async () => {
                console.log(`Self-destructing file: ${fileId}`);
                await deleteFile(fileId);
            }, 60000); // 1 minute delay
        }

        res.json({ downloadUrl, fileName: metadata.fileName });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

export default router;
