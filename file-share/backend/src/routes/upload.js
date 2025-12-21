import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { saveFileMetadata, getFileMetadata } from '../utils/storage.js';
import { uploadToS3 } from '../utils/s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for chunk uploads (temporary local storage)
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const uploadsDir = path.join(__dirname, '..', '..', 'temp');
            const fileId = req.body.fileId || req.headers['x-file-id'];

            if (!fileId) {
                return cb(new Error('Missing fileId'));
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

// Initialize upload
router.post('/init', async (req, res) => {
    try {
        const { fileName, fileSize, mimeType, chunkCount, expiryMs, selfDestruct, password } = req.body;
        const fileId = uuidv4();

        let expiresAt = null;
        if (expiryMs > 0) {
            expiresAt = new Date(Date.now() + expiryMs).toISOString();
        }

        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        await saveFileMetadata(fileId, {
            fileId,
            fileName,
            fileSize,
            mimeType,
            chunkCount,
            uploadedChunks: [],
            createdAt: new Date(),
            status: 'uploading',
            expiresAt,
            selfDestruct: selfDestruct || false,
            passwordHash,
            s3Key: fileId // S3 object key
        });

        res.json({ fileId, message: 'Upload initialized' });
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
            return res.status(404).json({ error: 'File not found' });
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

// Complete upload - merge chunks and upload to S3
router.post('/complete', async (req, res) => {
    try {
        const { fileId } = req.body;

        const metadata = await getFileMetadata(fileId);
        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        const tempDir = path.join(__dirname, '..', '..', 'temp');
        const chunkDir = path.join(tempDir, fileId);

        // Merge chunks into a single buffer
        const chunks = [];
        for (let i = 0; i < metadata.chunkCount; i++) {
            const chunkPath = path.join(chunkDir, `chunk_${i}`);
            try {
                const chunkData = await fs.readFile(chunkPath);
                chunks.push(chunkData);
            } catch {
                throw new Error(`Missing chunk ${i}`);
            }
        }
        const fileBuffer = Buffer.concat(chunks);

        // Upload to S3
        await uploadToS3(fileId, fileBuffer, metadata.mimeType);

        // Cleanup temp chunks
        try {
            await fs.rm(chunkDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn('Cleanup warning:', cleanupError.message);
        }

        // Update metadata
        metadata.status = 'completed';
        await saveFileMetadata(fileId, metadata);

        const shareLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/d/${fileId}`;

        res.json({
            success: true,
            fileId,
            shareLink,
            fileName: metadata.fileName
        });
    } catch (error) {
        console.error('Complete error:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ error: 'Failed to complete upload', details: error.message });
    }
});

export default router;
