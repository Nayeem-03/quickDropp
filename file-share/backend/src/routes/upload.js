import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { saveFileMetadata, getFileMetadata } from '../utils/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Store file metadata in persistent JSON (removed in-memory Map)

// Configure multer for chunk uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const uploadsDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
            const fileId = req.body.fileId || req.headers['x-file-id'];

            if (!fileId) {
                return cb(new Error('Missing fileId - ensure it is sent before the file in FormData'));
            }

            const chunkDir = path.join(uploadsDir, fileId);
            await fs.mkdir(chunkDir, { recursive: true });
            cb(null, chunkDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const chunkIndex = req.body.chunkIndex || req.headers['x-chunk-index'];
        cb(null, `chunk_${chunkIndex}`);
    }
});

const upload = multer({ storage });

// Initialize upload - create file entry
router.post('/init', async (req, res) => {
    try {
        const { fileName, fileSize, mimeType, chunkCount } = req.body;
        const fileId = uuidv4();

        // Save to Persistent Storage
        await saveFileMetadata(fileId, {
            fileId,
            fileName,
            fileSize,
            mimeType,
            chunkCount,
            uploadedChunks: [],
            createdAt: new Date(),
            status: 'uploading'
        });

        res.json({
            fileId,
            message: 'Upload initialized'
        });
    } catch (error) {
        console.error('Init error:', error);
        res.status(500).json({ error: 'Failed to initialize upload' });
    }
});

// Upload chunk
router.post('/chunk', upload.single('chunk'), async (req, res) => {
    try {
        const { fileId, chunkIndex } = req.body;

        const metadata = await getFileMetadata(fileId);
        if (!metadata) {
            return res.status(404).json({ error: 'File not found - metadata missing' });
        }

        metadata.uploadedChunks.push(parseInt(chunkIndex));
        await saveFileMetadata(fileId, metadata);

        res.json({
            success: true,
            chunkIndex: parseInt(chunkIndex),
            uploadedChunks: metadata.uploadedChunks.length,
            totalChunks: metadata.chunkCount
        });
    } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ error: 'Failed to upload chunk' });
    }
});

// Complete upload - merge chunks
router.post('/complete', async (req, res) => {
    try {
        const { fileId } = req.body;

        const metadata = await getFileMetadata(fileId);
        if (!metadata) {
            return res.status(404).json({ error: 'File not found - metadata missing' });
        }

        const uploadsDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
        const chunkDir = path.join(uploadsDir, fileId);

        // Sanitize filename to prevent invalid paths
        const safeFileName = metadata.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalPath = path.join(uploadsDir, `${fileId}_${safeFileName}`);

        // Merge chunks
        const writeStream = await fs.open(finalPath, 'w');
        for (let i = 0; i < metadata.chunkCount; i++) {
            const chunkPath = path.join(chunkDir, `chunk_${i}`);
            // Check if chunk exists
            try {
                await fs.access(chunkPath);
            } catch {
                throw new Error(`Missing chunk ${i} - upload incomplete`);
            }

            const chunkData = await fs.readFile(chunkPath);
            await writeStream.write(chunkData);
        }
        await writeStream.close();

        // Cleanup chunks (don't fail request if cleanup fails)
        try {
            await fs.rm(chunkDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
        }

        metadata.status = 'completed';
        metadata.filePath = finalPath;
        await saveFileMetadata(fileId, metadata);

        const shareLink = `${process.env.CLIENT_URL}/d/${fileId}`;

        res.json({
            success: true,
            fileId,
            shareLink,
            fileName: metadata.fileName
        });
    } catch (error) {
        console.error('Complete error details:', error);
        res.status(500).json({
            error: 'Failed to complete upload',
            details: error.message
        });
    }
});

export default router;
