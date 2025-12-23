import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy-initialize S3 client (only when first used, after env vars are loaded)
let s3Client = null;
let BUCKET_NAME = null;

function getS3Client() {
    if (!s3Client) {
        console.log('🔧 AWS Config Check:');
        console.log('Region:', process.env.AWS_REGION);
        console.log('Bucket:', process.env.S3_BUCKET_NAME);
        console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...` : 'MISSING');
        console.log('Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET (hidden)' : 'MISSING');

        s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });

        BUCKET_NAME = process.env.S3_BUCKET_NAME;
    }
    return s3Client;
}

// Get presigned URL for direct upload (single file up to 5GB)
export async function getPresignedUploadUrl(fileId, mimeType, expiresIn = 3600) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        ContentType: mimeType
    });

    return getSignedUrl(getS3Client(), command, { expiresIn });
}

// Initialize multipart upload for large files
export async function initMultipartUpload(fileId, mimeType) {
    const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        ContentType: mimeType
    });

    const response = await getS3Client().send(command);
    return response.UploadId;
}

// Get presigned URL for uploading a part
export async function getPresignedPartUrl(fileId, uploadId, partNumber, expiresIn = 3600) {
    const command = new UploadPartCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId,
        PartNumber: partNumber
    });

    return getSignedUrl(getS3Client(), command, { expiresIn });
}

// Complete multipart upload
export async function completeMultipartUpload(fileId, uploadId, parts) {
    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
    });

    await getS3Client().send(command);
}

// Abort multipart upload
export async function abortMultipartUpload(fileId, uploadId) {
    const command = new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        UploadId: uploadId
    });

    await getS3Client().send(command);
}

// Get signed download URL
export async function getSignedDownloadUrl(fileId, fileName, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId,
        ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    return getSignedUrl(getS3Client(), command, { expiresIn });
}

// Delete file from S3
export async function deleteFromS3(fileId) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME || process.env.S3_BUCKET_NAME,
        Key: fileId
    });

    await getS3Client().send(command);
}
