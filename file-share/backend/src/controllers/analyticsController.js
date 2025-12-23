import Analytics from '../models/Analytics.js';
import Link from '../models/Link.js';

// Get analytics for a specific link
export const getAnalytics = async (req, res) => {
    try {
        const { linkId } = req.params;

        const link = await Link.findOne({ linkId });
        if (!link) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const analytics = await Analytics.find({ linkId }).sort({ timestamp: -1 });

        res.json({
            linkId: link.linkId,
            fileName: link.originalName,
            fileSize: link.size,
            createdAt: link.createdAt,
            downloadCount: link.downloadCount || 0,
            maxDownloads: link.maxDownloads,
            expiresAt: link.expiresAt,
            downloads: analytics.map(a => ({
                timestamp: a.timestamp,
                country: a.country,
                city: a.city,
                device: a.device,
                browser: a.browser,
                ipAddress: a.ipAddress ? a.ipAddress.substring(0, 10) + '...' : 'Unknown'
            }))
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};
