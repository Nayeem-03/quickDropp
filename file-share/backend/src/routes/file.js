import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { getFileMetadata } from '../utils/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Get file info
router.get('/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;

        const metadata = await getFileMetadata(fileId);

        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.json({
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            mimeType: metadata.mimeType
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Download file
router.get('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const metadata = await getFileMetadata(fileId);

        if (!metadata || !metadata.filePath) {
            return res.status(404).json({ error: 'File not found or not ready' });
        }

        try {
            await fs.access(metadata.filePath);
        } catch {
            return res.status(404).json({ error: 'File missing from disk' });
        }

        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`);
        res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', metadata.fileSize);

        // Stream file
        res.sendFile(metadata.filePath);

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    }
});

export default router;
