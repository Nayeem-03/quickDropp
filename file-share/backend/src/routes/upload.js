import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, completeMultipartUpload } from '../utils/s3.js';

const router = express.Router();

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB per part for multipart

// Initialize upload - returns presigned URL(s) for direct S3 upload
router.post('/init', async (req, res) => {
    try {
        const { fileName, fileSize, mimeType, expiryMs, selfDestruct, password, releaseDate } = req.body;

        // Generate a new Link ID (public) and S3 Key (internal)
        // For a new upload, they can be different or same. Let's make them different for security/mutability.
        const linkId = uuidv4();
        const s3Key = uuidv4();

        let expiresAt = null;
        if (expiryMs > 0) {
            expiresAt = new Date(Date.now() + expiryMs);
        }

        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }

        // Determine if we need multipart upload (for files > 100MB)
        const useMultipart = fileSize > CHUNK_SIZE;
        let uploadData = {};

        if (useMultipart) {
            // Initialize multipart upload using s3Key
            const uploadId = await initMultipartUpload(s3Key, mimeType);
            const numParts = Math.ceil(fileSize / CHUNK_SIZE);
            const partUrls = [];

            for (let i = 1; i <= numParts; i++) {
                const url = await getPresignedPartUrl(s3Key, uploadId, i);
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
            const uploadUrl = await getPresignedUploadUrl(s3Key, mimeType);
            uploadData = {
                multipart: false,
                uploadUrl
            };
        }

        // Save metadata to MongoDB
        const newLink = new Link({
            linkId,
            s3Key,
            originalName: fileName,
            size: fileSize,
            mimeType,
            expiresAt,
            releaseDate: releaseDate ? new Date(releaseDate) : null,
            maxDownloads: selfDestruct ? 1 : null, // Simple self-destruct logic
            passwordHash,
            // Store temporary upload data (optional, or rely on client state)
            // status: 'uploading' // You might want to add a status field to Schema if not there
        });

        await newLink.save();

        res.json({
            fileId: linkId, // Return linkId as "fileId" to frontend
            s3Key,          // Needed for client to know which file to track, but maybe unnecessary if we only track linkId
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
        const { fileId, parts } = req.body; // fileId here is the linkId

        const link = await Link.findOne({ linkId: fileId });
        if (!link) {
            return res.status(404).json({ error: 'File link not found' });
        }

        // If it was multipart, we need the uploadId. 
        // Note: The current Schema doesn't store uploadId. 
        // We might need to pass uploadId from client or store it in DB.
        // For S3 multipart completion, we need the S3 Key and UploadId.
        // Assuming client passes `uploadId` back in this request for simplicity, 
        // OR we should have stored it. 
        // Let's assume the Client sends existing state back including uploadId.

        const { uploadId } = req.body; // Expect client to send this back

        // Complete multipart upload if applicable
        if (uploadId && parts) {
            await completeMultipartUpload(link.s3Key, uploadId, parts);
        }

        // We don't really need to update "status" in DB unless we added that field.
        // But if we did, we would do:
        // link.status = 'completed';
        // await link.save();

        const shareLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/d/${link.linkId}`;

        res.json({
            success: true,
            fileId: link.linkId,
            shareLink,
            fileName: link.originalName
        });
    } catch (error) {
        console.error('Complete error:', error);
        res.status(500).json({ error: 'Failed to complete upload' });
    }
});

export default router;
