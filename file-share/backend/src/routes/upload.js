import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { saveFileMetadata, getFileMetadata } from '../utils/storage.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, completeMultipartUpload } from '../utils/s3.js';

const router = express.Router();

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB per part for multipart

// Initialize upload - returns presigned URL(s) for direct S3 upload
router.post('/init', async (req, res) => {
    try {
        const { fileName, fileSize, mimeType, expiryMs, selfDestruct, password } = req.body;
        const fileId = uuidv4();

        let expiresAt = null;
        if (expiryMs > 0) {
            expiresAt = new Date(Date.now() + expiryMs).toISOString();
        }

        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        // Determine if we need multipart upload (for files > 100MB)
        const useMultipart = fileSize > CHUNK_SIZE;
        let uploadData = {};

        if (useMultipart) {
            // Initialize multipart upload
            const uploadId = await initMultipartUpload(fileId, mimeType);
            const numParts = Math.ceil(fileSize / CHUNK_SIZE);
            const partUrls = [];

            for (let i = 1; i <= numParts; i++) {
                const url = await getPresignedPartUrl(fileId, uploadId, i);
                partUrls.push({ partNumber: i, url });
            }

            uploadData = {
                multipart: true,
                uploadId,
                partUrls,
                chunkSize: CHUNK_SIZE
            };
        } else {
            // Single presigned URL for small files
            const uploadUrl = await getPresignedUploadUrl(fileId, mimeType);
            uploadData = {
                multipart: false,
                uploadUrl
            };
        }

        // Save metadata
        await saveFileMetadata(fileId, {
            fileId,
            fileName,
            fileSize,
            mimeType,
            createdAt: new Date(),
            status: 'uploading',
            expiresAt,
            selfDestruct: selfDestruct || false,
            passwordHash,
            uploadId: uploadData.uploadId || null
        });

        res.json({
            fileId,
            ...uploadData
        });
    } catch (error) {
        console.error('Init error:', error);
        res.status(500).json({ error: 'Failed to initialize upload' });
    }
});

// Complete upload (for multipart uploads)
router.post('/complete', async (req, res) => {
    try {
        const { fileId, parts } = req.body;

        const metadata = await getFileMetadata(fileId);
        if (!metadata) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Complete multipart upload if applicable
        if (metadata.uploadId && parts) {
            await completeMultipartUpload(fileId, metadata.uploadId, parts);
        }

        // Update metadata
        metadata.status = 'completed';
        metadata.uploadId = null;
        await saveFileMetadata(fileId, metadata);

        const shareLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/d/${fileId}`;

        res.json({
            success: true,
            fileId,
            shareLink,
            fileName: metadata.fileName
        });
    } catch (error) {
        console.error('Complete error:', error);
        res.status(500).json({ error: 'Failed to complete upload' });
    }
});

export default router;
