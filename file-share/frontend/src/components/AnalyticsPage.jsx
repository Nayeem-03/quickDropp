import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export function AnalyticsPage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchAnalytics();
    }, [fileId]);

    const fetchAnalytics = async () => {
        try {
            const response = await fetch(`${API_URL}/api/analytics/${fileId}`);
            if (!response.ok) throw new Error('Failed to fetch analytics');
            const data = await response.json();
            setAnalytics(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="text-white">Loading analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 p-4">
            <div className="max-w-4xl mx-auto py-8">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="text-slate-400 hover:text-white mb-4 flex items-center gap-2 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                    <h1 className="text-3xl font-bold text-white">Analytics Dashboard</h1>
                    <p className="text-slate-400 mt-1">Track your file's downloads</p>
                </div>

                {/* File Info Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-white mb-2">{analytics.fileName}</h2>
                            <div className="flex gap-4 text-sm text-slate-400">
                                <span>{formatFileSize(analytics.fileSize)}</span>
                                <span>•</span>
                                <span>Created {formatDate(analytics.createdAt)}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold text-blue-400">{analytics.downloadCount}</div>
                            <div className="text-sm text-slate-500">Downloads</div>
                        </div>
                    </div>

                    {analytics.expiresAt && (
                        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                            <p className="text-sm text-slate-400">
                                Expires: {formatDate(analytics.expiresAt)}
                            </p>
                            <button
                                onClick={() => navigate(`/replace/${fileId}`)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                🔄 Replace File
                            </button>
                        </div>
                    )}
                    {!analytics.expiresAt && (
                        <div className="mt-4 pt-4 border-t border-slate-800 text-right">
                            <button
                                onClick={() => navigate(`/replace/${fileId}`)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                🔄 Replace File
                            </button>
                        </div>
                    )}
                </div>

                {/* Downloads List */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800">
                        <h3 className="text-lg font-semibold text-white">Download History</h3>
                    </div>

                    {analytics.downloads && analytics.downloads.length > 0 ? (
                        <div className="divide-y divide-slate-800">
                            {analytics.downloads.map((download, index) => (
                                <div key={index} className="p-6 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                {/* Location Icon */}
                                                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">
                                                        {download.city || 'Unknown'}, {download.country || 'Unknown'}
                                                    </p>
                                                    <p className="text-sm text-slate-400">
                                                        {download.device} • {download.browser}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right text-sm text-slate-500">
                                            {formatDate(download.timestamp)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <p className="text-slate-400">No downloads yet</p>
                            <p className="text-sm text-slate-600 mt-1">Share your link to start tracking</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
