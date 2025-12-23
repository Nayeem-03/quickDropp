import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema({
    linkId: {
        type: String,
        required: true,
        index: true,
        ref: 'Link'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    ipAddress: String, // Anonymize if needed clearly
    country: String,
    city: String,
    device: String, // e.g., "iPhone", "Windows"
    browser: String,
    referer: String,
    userAgent: String
});

const Analytics = mongoose.model('Analytics', analyticsSchema);
export default Analytics;
