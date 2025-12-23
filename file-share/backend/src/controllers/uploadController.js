import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import Link from '../models/Link.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, completeMultipartUpload } from '../utils/s3.js';

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB per part for multipart

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

        // Determine if we need multipart upload (for files > 100MB)
        const useMultipart = fileSize > CHUNK_SIZE;
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
