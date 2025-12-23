import { v4 as uuidv4 } from 'uuid';
import Link from '../models/Link.js';
import { getPresignedUploadUrl, initMultipartUpload, getPresignedPartUrl, deleteFromS3 } from '../utils/s3.js';

const CHUNK_SIZE = 25 * 1024 * 1024; // 25MB per part for optimal large file uploads
const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // Use multipart for files > 10MB

// Replace file content (mutable link)
export const replaceFile = async (req, res) => {
    try {
        const { linkId } = req.params;
        const { fileName, fileSize, mimeType } = req.body;

        const link = await Link.findOne({ linkId });
        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // Delete the old file from S3
        try {
            await deleteFromS3(link.s3Key);
        } catch {
            // Continue anyway - we'll upload the new file
        }

        // Generate a NEW S3 key for the replacement file
        const newS3Key = uuidv4();

        // Determine if we need multipart upload
        const useMultipart = fileSize > MULTIPART_THRESHOLD;
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
        link.downloadCount = 0;
        await link.save();

        res.json({
            linkId: link.linkId,
            s3Key: newS3Key,
            ...uploadData
        });
    } catch {
        res.status(500).json({ error: 'Failed to replace file' });
    }
};
