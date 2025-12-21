import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
dotenv.config();    

// Validate required env vars
const requiredEnvVars = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing env variable: ${envVar}`);
    }
}

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Upload file buffer to S3
export async function uploadToS3(fileId, buffer, mimeType) {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileId,
        Body: buffer,
        ContentType: mimeType
    });

    await s3Client.send(command);
    return { key: fileId };
}

// Get a signed download URL (valid for 1 hour)
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
