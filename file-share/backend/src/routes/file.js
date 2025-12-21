import express from 'express';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import { getFileMetadata, deleteFileMetadata } from '../utils/storage.js';

const router = express.Router();

// Check if file is expired
const isExpired = (metadata) => {
    if (!metadata.expiresAt) return false;
    return new Date(metadata.expiresAt) < new Date();
};

// Delete file and metadata
const deleteFile = async (fileId, filePath) => {
    try {
        if (filePath) await fs.unlink(filePath);
        await deleteFileMetadata(fileId);
    } catch (err) {
        console.error('Delete error:', err.message);
    }
};

// Get file info (checks if password protected)
router.get('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await getFileMetadata(fileId);

        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (isExpired(metadata)) {
            await deleteFile(fileId, metadata.filePath);
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

// Verify password for protected files
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

// Download file (requires password in header if protected)
router.get('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const password = req.headers['x-file-password'];

        const metadata = await getFileMetadata(fileId);

        if (!metadata || !metadata.filePath) {
            return res.status(404).json({ error: 'File not found' });
        }

        if (isExpired(metadata)) {
            await deleteFile(fileId, metadata.filePath);
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

        try {
            await fs.access(metadata.filePath);
        } catch {
            return res.status(404).json({ error: 'File missing from disk' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
        res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', metadata.fileSize);

        res.sendFile(metadata.filePath, async (err) => {
            if (err) {
                console.error('Send file error:', err);
            } else if (metadata.selfDestruct) {
                console.log(`Self-destructing file: ${fileId}`);
                await deleteFile(fileId, metadata.filePath);
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
});

export default router;
