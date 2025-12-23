import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL } from '../config.js';

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

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                    <div className="text-center mb-8">
                        <Link to="/"><h1 className="text-3xl font-bold text-white hover:text-slate-300 transition-colors">QuickDrop</h1></Link>
                    </div>

                    {error && (
                        <div className="text-center space-y-5">
                            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${errorType === 'expired' ? 'bg-amber-500/10' :
                                    errorType === 'scheduled' ? 'bg-blue-500/10' :
                                        'bg-red-500/10'
                                }`}>
                                <svg className={`w-8 h-8 ${errorType === 'expired' ? 'text-amber-400' :
                                        errorType === 'scheduled' ? 'text-blue-400' :
                                            'text-red-400'
                                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {errorType === 'scheduled' ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    )}
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    {errorType === 'expired' ? 'File Expired' :
                                        errorType === 'deleted' ? 'File Deleted' :
                                            errorType === 'scheduled' ? 'File Locked' :
                                                'File Not Found'}
                                </h2>
                                <p className="text-slate-500 text-sm mt-2">{error}</p>
                                {errorType === 'scheduled' && countdown && (
                                    <div className="mt-4 p-4 bg-slate-800 rounded-xl">
                                        <p className="text-xs text-slate-400 mb-2">Available in:</p>
                                        <p className="text-2xl font-bold text-blue-400">{countdown}</p>
                                    </div>
                                )}
                            </div>
                            {errorType !== 'scheduled' && (
                                <Link to="/" className="inline-block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors">Upload a File</Link>
                            )}
                        </div>
                    )}

                    {!error && !metadata && (
                        <div className="text-center py-8">
                            <div className="w-10 h-10 mx-auto border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-slate-500 mt-4 text-sm">Loading...</p>
                        </div>
                    )}

                    {metadata && (
                        <div className="text-center space-y-5">
                            <div className="w-16 h-16 mx-auto bg-slate-800 rounded-xl flex items-center justify-center relative">
                                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {metadata.passwordProtected && (
                                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h2 className="text-lg font-semibold text-white break-all">{metadata.fileName}</h2>
                                <p className="text-slate-500 text-sm mt-1">{formatFileSize(metadata.fileSize)}</p>
                                <div className="mt-3 flex items-center justify-center gap-2 text-xs flex-wrap">
                                    {metadata.selfDestruct && <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-md">⚠️ Self-destructs</span>}
                                    {metadata.expiresAt && <span className="px-2 py-1 bg-slate-800 text-slate-400 rounded-md">⏱️ {formatExpiry(metadata.expiresAt)}</span>}
                                    {metadata.passwordProtected && <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded-md">🔒 Protected</span>}
                                </div>
                            </div>

                            {needsPassword && (
                                <div className="space-y-2">
                                    <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                        placeholder="Enter password" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500" />
                                    {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
                                </div>
                            )}

                            <button onClick={handleDownload} disabled={downloading}
                                className={`w-full py-3 bg-blue-600 text-white font-medium rounded-xl transition-colors ${downloading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-blue-500'}`}>
                                {downloading ? 'Downloading...' : '⬇️ Download'}
                            </button>

                            <Link to="/" className="inline-block text-slate-500 hover:text-slate-300 transition-colors text-sm">Share your own file →</Link>
                        </div>
                    )}
                </div>
                <p className="text-center text-slate-600 text-xs mt-5">No limits • No registration</p>
            </div>
        </div>
    );
}
