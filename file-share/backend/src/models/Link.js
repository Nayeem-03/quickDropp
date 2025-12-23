import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema({
    linkId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    s3Key: { // The pointer to the actual file in S3. Mutable!
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimeType: String,
    size: Number,
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        index: { expires: 0 } // TTL Index: MongoDB automatically deletes this doc when it expires
    },
    releaseDate: {
        type: Date,
        default: null
    },
    passwordHash: { // For password protection
        type: String,
        default: null
    },
    downloadCount: {
        type: Number,
        default: 0
    },
    maxDownloads: { // For "Burn after reading"
        type: Number,
        default: null
    },
    ownerId: { // If we add user accounts later
        type: String, // could be an IP or a User ID
        index: true
    },
    isEncrypted: {
        type: Boolean,
        default: false
    },
    encryptionMetadata: { // Store IV or salt if needed (Key is in URL hash, not here)
        iv: String,
        salt: String
    }
}, { timestamps: true });

// Check if link is still valid logic can be added as methods
linkSchema.methods.isValid = function () {
    const now = new Date();
    if (this.expiresAt && now > this.expiresAt) return false;
    if (this.maxDownloads && this.downloadCount >= this.maxDownloads) return false;
    return true;
};

// Cleanup S3 file when document is deleted (including TTL expiry)
linkSchema.pre('deleteOne', { document: true, query: false }, async function () {
    try {
        // Dynamically import to avoid circular dependency
        const { deleteFromS3 } = await import('../utils/s3.js');
        console.log(`🧹 TTL Cleanup: Deleting S3 file for expired link ${this.linkId}`);
        await deleteFromS3(this.s3Key);
        console.log(`✅ S3 file deleted via TTL cleanup`);
    } catch (err) {
        console.error('TTL cleanup error:', err.message);
    }
});

const Link = mongoose.model('Link', linkSchema);
export default Link;
