import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Link from '../models/Link.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, completeMultipartUpload, deleteFromS3 } from '../utils/s3.js';

const router = express.Router();

const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB per part for multipart

// Replace file content (mutable link)
router.post('/:linkId', async (req, res) => {
    try {
        const { linkId } = req.params;
        const { fileName, fileSize, mimeType } = req.body;

        // Find the existing link
        const link = await Link.findOne({ linkId });
        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Delete the old file from S3
        try {
            await deleteFromS3(link.s3Key);
            console.log(`🔄 Deleted old file for mutable link: ${link.s3Key}`);
        } catch (err) {
            console.error('Error deleting old file:', err.message);
            // Continue anyway - we'll upload the new file
        }

        // Generate a NEW S3 key for the replacement file
        const newS3Key = uuidv4();

        // Determine if we need multipart upload
        const useMultipart = fileSize > CHUNK_SIZE;
        let uploadData = {};

        if (useMultipart) {
            const uploadId = await initMultipartUpload(newS3Key, mimeType);
            const numParts = Math.ceil(fileSize / CHUNK_SIZE);
            const partUrls = [];

            for (let i = 1; i <= numParts; i++) {
                const url = await getPresignedPartUrl(newS3Key, uploadId, i);
                partUrls.push({ partNumber: i, url });
            }

            uploadData = {
                multipart: true,
                uploadId,
                partUrls,
                chunkSize: CHUNK_SIZE
            };
        } else {
            const uploadUrl = await getPresignedUploadUrl(newS3Key, mimeType);
            uploadData = {
                multipart: false,
                uploadUrl
            };
        }

        // Update the link with new file metadata
        link.s3Key = newS3Key;
        link.originalName = fileName;
        link.size = fileSize;
        link.mimeType = mimeType;
        link.downloadCount = 0; // Reset download count
        await link.save();

        console.log(`✅ Mutable link updated: ${linkId} → new S3 key: ${newS3Key}`);

        res.json({
            linkId: link.linkId,
            s3Key: newS3Key,
            ...uploadData
        });
    } catch (error) {
        console.error('Replace error:', error);
        res.status(500).json({ error: 'Failed to replace file' });
    }
});

export default router;
