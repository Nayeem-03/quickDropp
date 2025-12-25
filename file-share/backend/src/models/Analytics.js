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
    ipAddress: String,
    country: String,
    region: String,    // State/Province
    city: String,
    zip: String,       // Postal code
    isp: String,       // Internet Service Provider
    timezone: String,
    device: String,
    browser: String,
    referer: String,
    userAgent: String
});

const Analytics = mongoose.model('Analytics', analyticsSchema);
export default Analytics;
