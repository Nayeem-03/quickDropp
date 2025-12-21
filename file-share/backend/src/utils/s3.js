import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Get presigned URL for direct upload (single file up to 5GB)
export async function getPresignedUploadUrl(fileId, mimeType, expiresIn = 3600) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        ContentType: mimeType
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

// Initialize multipart upload for large files
export async function initMultipartUpload(fileId, mimeType) {
    const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        ContentType: mimeType
    });

    const response = await s3Client.send(command);
    return response.UploadId;
}

// Get presigned URL for uploading a part
export async function getPresignedPartUrl(fileId, uploadId, partNumber, expiresIn = 3600) {
    const command = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId,
        PartNumber: partNumber
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

// Complete multipart upload
export async function completeMultipartUpload(fileId, uploadId, parts) {
    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
    });

    await s3Client.send(command);
}

// Abort multipart upload
export async function abortMultipartUpload(fileId, uploadId) {
    const command = new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId
    });

    await s3Client.send(command);
}

// Get signed download URL
export async function getSignedDownloadUrl(fileId, fileName, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    return getSignedUrl(s3Client, command, { expiresIn });
}

// Delete file from S3
export async function deleteFromS3(fileId) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileId
    });

    await s3Client.send(command);
}
