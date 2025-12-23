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
        const interval = setInterval(fetchAnalytics, 3000);
        return () => clearInterval(interval);
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
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 animate-fade-in">
                    <div className="w-5 h-5 border-2 border-neutral-800 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-neutral-500 text-xs">Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
                <div className="text-center animate-fade-in">
                    <div className="w-12 h-12 mx-auto bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <p className="text-neutral-200 mb-6">{error}</p>
                    <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors">
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-950 p-4 font-sans">
            <div className="max-w-4xl mx-auto py-8">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <button
                            onClick={() => navigate('/')}
                            className="text-neutral-500 hover:text-white mb-2 flex items-center gap-2 transition-colors text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to Upload
                        </button>
                        <h1 className="text-2xl font-bold text-neutral-200 tracking-tight">Analytics Dashboard</h1>
                    </div>
                    <div className="hidden sm:block">
                        <div className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Live Updates</span>
                        </div>
                    </div>
                </div>

                {/* File Info Card */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 mb-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 relative z-10">
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-200 mb-2">{analytics.fileName}</h2>
                            <div className="flex gap-4 text-xs text-neutral-500 font-mono">
                                <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg> {formatFileSize(analytics.fileSize)}</span>
                                <span className="opacity-30">|</span>
                                <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> {formatDate(analytics.createdAt)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 sm:block sm:text-right">
                            <div className="bg-neutral-900 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-none border-neutral-800 flex-1 sm:flex-none flex sm:block items-center justify-between sm:justify-start">
                                <span className="text-xs text-neutral-500 sm:mb-1 block">Total Downloads</span>
                                <div className="text-2xl font-bold text-indigo-400">{analytics.downloadCount}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-neutral-800/50 flex items-center justify-between relative z-10">
                        {analytics.expiresAt ? (
                            <p className="text-xs text-neutral-500 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-600"></span>
                                Expires: {formatDate(analytics.expiresAt)}
                            </p>
                        ) : (
                            <p className="text-xs text-neutral-500 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Never Expires
                            </p>
                        )}
                        <button
                            onClick={() => navigate(`/replace/${fileId}`)}
                            className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Replace File
                        </button>
                    </div>
                </div>

                {/* Downloads List */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-neutral-800 flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider">Download History</h3>
                        <span className="text-xs text-neutral-600">{analytics.downloads?.length || 0} events</span>
                    </div>

                    {analytics.downloads && analytics.downloads.length > 0 ? (
                        <div className="divide-y divide-neutral-800">
                            {analytics.downloads.map((download, index) => (
                                <div key={index} className="p-5 hover:bg-neutral-900/40 transition-colors group">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            {/* Location Icon */}
                                            <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center flex-shrink-0 text-neutral-500 group-hover:text-indigo-400 transition-colors border border-neutral-800 group-hover:border-indigo-500/30">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-neutral-300 font-medium text-sm">
                                                    {download.city || 'Unknown'}, {download.country || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                                                    {download.device} • {download.browser}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right text-xs text-neutral-600 font-mono pl-12 sm:pl-0">
                                            {formatDate(download.timestamp)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-16 text-center">
                            <div className="w-12 h-12 mx-auto mb-4 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
                                <svg className="w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-neutral-400 font-medium text-sm">No downloads yet</p>
                            <p className="text-xs text-neutral-600 mt-2">Share your link to start tracking real-time activity</p>
                        </div>
                    )}
                </div>

                <p className="text-center text-neutral-800 text-xs mt-8">
                    QuickDrop Analytics • Real-time
                </p>
            </div>
        </div>
    );
}
