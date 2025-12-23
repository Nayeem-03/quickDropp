import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, completeMultipartUpload } from '../utils/s3.js';

const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB per part for optimal large file uploads
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // Use multipart for files > 10MB

// Initialize upload - returns presigned URL(s) for direct S3 upload
export const initUpload = async (req, res) => {
    try {
        const { fileName, fileSize, mimeType, expiryMs, selfDestruct, password, releaseDate } = req.body;

        // Generate a new Link ID (public) and S3 Key (internal)
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

        // Determine if we need multipart upload (for files > 10MB)
        const useMultipart = fileSize > MULTIPART_THRESHOLD;
        let uploadData = {};

        if (useMultipart) {
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
            maxDownloads: selfDestruct ? 1 : null,
            passwordHash
        });

        await newLink.save();

        res.json({
            fileId: linkId,
            s3Key,
            ...uploadData
        });
    } catch {
        res.status(500).json({ error: 'Failed to initialize upload' });
    }
};

// Complete upload (for multipart uploads)
export const completeUpload = async (req, res) => {
    try {
        const { fileId, parts, uploadId } = req.body;

        const link = await Link.findOne({ linkId: fileId });
        if (!link) {
            return res.status(404).json({ error: 'File link not found' });
        }

        // Complete multipart upload if applicable
        if (uploadId && parts) {
            await completeMultipartUpload(link.s3Key, uploadId, parts);
        }

        const shareLink = `${process.env.CLIENT_URL || 'http://localhost:3000'}/d/${link.linkId}`;

        res.json({
            success: true,
            fileId: link.linkId,
            shareLink,
            fileName: link.originalName
        });
    } catch {
        res.status(500).json({ error: 'Failed to complete upload' });
    }
};

// Refresh presigned URLs for resuming an interrupted multipart upload
export const refreshPartUrls = async (req, res) => {
    try {
        const { fileId, uploadId, partNumbers } = req.body;

        if (!fileId || !uploadId || !partNumbers || !Array.isArray(partNumbers)) {
            return res.status(400).json({ error: 'Missing required fields: fileId, uploadId, partNumbers (array)' });
        }

        // Find the link to get the s3Key
        const link = await Link.findOne({ linkId: fileId });
        if (!link) {
            return res.status(404).json({ error: 'File link not found' });
        }

        // Generate fresh presigned URLs for the requested part numbers
        const partUrls = [];
        for (const partNumber of partNumbers) {
            const url = await getPresignedPartUrl(link.s3Key, uploadId, partNumber);
            partUrls.push({ partNumber, url });
        }

        res.json({ partUrls });
    } catch (error) {
        console.error('Refresh part URLs error:', error);
        res.status(500).json({ error: 'Failed to refresh presigned URLs' });
    }
};
