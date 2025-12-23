import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL } from '../config.js';
import { FilePreview } from './FilePreview.jsx';

export function DownloadPage() {
    const { fileId } = useParams();
    const [metadata, setMetadata] = useState(null);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [needsPassword, setNeedsPassword] = useState(false);
    const [releaseDate, setReleaseDate] = useState(null);
    const [countdown, setCountdown] = useState('');

    // Preview state
    const [showPreview, setShowPreview] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/api/files/${fileId}`)
            .then(async res => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (res.status === 410) {
                        throw { message: 'File has expired', type: 'expired' };
                    }
                    if (res.status === 403 && data.releaseDate) {
                        setReleaseDate(data.releaseDate);
                        throw { message: 'File not yet released', type: 'scheduled' };
                    }
                    throw { message: data.error || 'File not found', type: 'not_found' };
                }
                return res.json();
            })
            .then(data => {
                setMetadata(data);
                setNeedsPassword(data.passwordProtected);
            })
            .catch(err => {
                setError(err.message || 'File not found');
                setErrorType(err.type || 'not_found');
            });
    }, [fileId]);

    // Countdown timer for scheduled access
    useEffect(() => {
        if (!releaseDate) return;

        const updateCountdown = () => {
            const now = new Date();
            const release = new Date(releaseDate);
            const diff = release - now;

            if (diff <= 0) {
                setCountdown('Available now!');
                window.location.reload();
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);

            if (days > 0) {
                setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
            } else if (hours > 0) {
                setCountdown(`${hours}h ${minutes}m ${seconds}s`);
            } else if (minutes > 0) {
                setCountdown(`${minutes}m ${seconds}s`);
            } else {
                setCountdown(`${seconds}s`);
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [releaseDate]);

    const handleDownload = async () => {
        if (needsPassword && !password) {
            setPasswordError('Please enter the password');
            return;
        }

        setDownloading(true);
        setPasswordError('');

        try {
            const response = await fetch(`${API_URL}/api/files/download/${fileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password || null })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setPasswordError(response.status === 401 ? (data.error || 'Incorrect password') : (data.error || 'Download failed'));
                setDownloading(false);
                return;
            }

            const { downloadUrl } = await response.json();
            window.location.href = downloadUrl;

            if (metadata?.selfDestruct) {
                setTimeout(() => {
                    setError('This was a self-destructing file. It has been deleted.');
                    setErrorType('deleted');
                    setMetadata(null);
                }, 3000);
            }
        } catch {
            setPasswordError('Download failed');
        }

        setTimeout(() => setDownloading(false), 2000);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatExpiry = (expiresAt) => {
        if (!expiresAt) return 'Never';
        const diff = new Date(expiresAt) - new Date();
        if (diff <= 0) return 'Expired';
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (days > 0) return `${days}d left`;
        if (hours > 0) return `${hours}h left`;
        if (minutes > 0) return `${minutes}m left`;
        return '<1m';
    };

    // Check if file type supports preview
    const canPreview = (mimeType) => {
        if (!mimeType) return false;
        return mimeType.startsWith('image/') ||
            mimeType.startsWith('video/') ||
            mimeType.startsWith('audio/') ||
            mimeType === 'application/pdf' ||
            mimeType.startsWith('text/') ||
            mimeType === 'application/json' ||
            mimeType === 'application/javascript';
    };

    const handlePreview = async () => {
        if (needsPassword && !password) {
            setPasswordError('Please enter the password');
            return;
        }

        setPreviewLoading(true);
        setPasswordError('');

        try {
            const response = await fetch(`${API_URL}/api/files/preview/${fileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password || null })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                if (response.status === 401) {
                    setPasswordError(data.error || 'Incorrect password');
                } else {
                    setPasswordError(data.error || 'Preview failed');
                }
                setPreviewLoading(false);
                return;
            }

            const { previewUrl } = await response.json();
            setPreviewUrl(previewUrl);
            setShowPreview(true);
        } catch {
            setPasswordError('Preview failed');
        }

        setPreviewLoading(false);
    };

    return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
            <div className={`w-full max-w-sm transition-all duration-500 ease-out ${!metadata && !error ? 'opacity-0' : 'opacity-100'}`}>

                {/* Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-block group">
                        <h1 className="text-xl font-bold tracking-tight text-neutral-200 group-hover:text-white transition-colors">QuickDrop</h1>
                    </Link>
                </div>

                {/* Main Card */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 shadow-2xl shadow-black/50 relative overflow-hidden group">
                    {/* Glass sheen */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    {error && (
                        <div className="text-center py-4 animate-fade-in">
                            <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-4 ${errorType === 'expired' ? 'bg-amber-500/10 text-amber-500' :
                                    errorType === 'scheduled' ? 'bg-indigo-500/10 text-indigo-500' :
                                        'bg-red-500/10 text-red-500'
                                }`}>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {errorType === 'scheduled' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    )}
                                </svg>
                            </div>

                            <h2 className="text-lg font-bold text-white mb-2">
                                {errorType === 'expired' ? 'Link Expired' :
                                    errorType === 'deleted' ? 'File Deleted' :
                                        errorType === 'scheduled' ? 'Not Available Yet' :
                                            'File Not Found'}
                            </h2>
                            <p className="text-neutral-500 text-sm mb-6 max-w-[200px] mx-auto leading-relaxed">{error}</p>

                            {errorType === 'scheduled' && countdown && (
                                <div className="mb-6 p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
                                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Unlocks in</p>
                                    <p className="text-2xl font-mono font-medium text-indigo-400">{countdown}</p>
                                </div>
                            )}

                            {errorType !== 'scheduled' && (
                                <Link to="/" className="inline-flex items-center justify-center w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl text-sm transition-colors">
                                    Upload New File
                                </Link>
                            )}
                        </div>
                    )}

                    {!error && !metadata && (
                        <div className="text-center py-12">
                            <div className="w-6 h-6 mx-auto border-2 border-neutral-800 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {metadata && (
                        <div className="animate-fade-in">
                            {/* File Icon */}
                            <div className="w-16 h-16 mx-auto bg-neutral-900 rounded-xl flex items-center justify-center mb-4 relative ring-1 ring-neutral-800">
                                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {metadata.passwordProtected && (
                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-neutral-950 border border-neutral-800 rounded-full flex items-center justify-center text-amber-500 shadow-sm">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    </div>
                                )}
                            </div>

                            <div className="text-center mb-6">
                                <h2 className="text-lg font-bold text-white break-all line-clamp-2">{metadata.fileName}</h2>
                                <p className="text-neutral-500 text-xs mt-1 font-mono">{formatFileSize(metadata.fileSize)}</p>

                                {/* Tags */}
                                <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                                    {metadata.selfDestruct && <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-medium rounded-md uppercase tracking-wide">Self-destruct</span>}
                                    {metadata.expiresAt && <span className="px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-medium rounded-md uppercase tracking-wide">{formatExpiry(metadata.expiresAt)}</span>}
                                </div>
                            </div>

                            {needsPassword && (
                                <div className="mb-6 animate-fade-in">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                        placeholder="Enter password to unlock"
                                        className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-200 placeholder-neutral-600 text-sm outline-none focus:border-indigo-500/50 transition-colors"
                                    />
                                    {passwordError && <p className="text-red-500 text-xs mt-2 text-center">{passwordError}</p>}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className={`w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2
                                        ${downloading ? 'opacity-75 cursor-not-allowed' : ''}`}
                                >
                                    {downloading ? (
                                        <>
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            Download File
                                        </>
                                    )}
                                </button>

                                {canPreview(metadata.mimeType) && (
                                    <button
                                        onClick={handlePreview}
                                        disabled={previewLoading}
                                        className="w-full py-2.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 font-medium rounded-xl text-sm transition-colors"
                                    >
                                        {previewLoading ? 'Loading Preview...' : 'Preview Content'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <Link to="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                        Ready to share your own files?
                    </Link>
                </div>
            </div>

            {/* File Preview Modal - Can remain mostly as is but let's check styles if reused */}
            {showPreview && previewUrl && (
                <FilePreview
                    previewUrl={previewUrl}
                    fileName={metadata?.fileName}
                    mimeType={metadata?.mimeType}
                    onClose={() => {
                        setShowPreview(false);
                        setPreviewUrl(null);
                    }}
                    onDownload={() => {
                        setShowPreview(false);
                        setPreviewUrl(null);
                        handleDownload();
                    }}
                />
            )}
        </div>
    );
}
