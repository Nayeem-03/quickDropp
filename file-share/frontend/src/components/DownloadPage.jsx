import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

export function DownloadPage() {
    const { fileId } = useParams();
    const [metadata, setMetadata] = useState(null);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [needsPassword, setNeedsPassword] = useState(false);

    useEffect(() => {
        fetch(`http://localhost:5000/api/files/${fileId}`)
            .then(async res => {
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    if (res.status === 410) {
                        throw { message: 'File has expired', type: 'expired' };
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

    const handleDownload = async () => {
        if (needsPassword && !password) {
            setPasswordError('Please enter the password');
            return;
        }

        // Verify password first if protected
        if (metadata?.passwordProtected) {
            try {
                const verifyRes = await fetch(`http://localhost:5000/api/files/verify/${fileId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                if (!verifyRes.ok) {
                    setPasswordError('Incorrect password');
                    return;
                }
            } catch {
                setPasswordError('Failed to verify password');
                return;
            }
        }

        setDownloading(true);
        setPasswordError('');

        // Create download link with password header
        const link = document.createElement('a');

        if (metadata?.passwordProtected) {
            // For password protected files, fetch with header
            try {
                const response = await fetch(`http://localhost:5000/api/files/download/${fileId}`, {
                    headers: { 'X-File-Password': password }
                });

                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    setPasswordError(data.error || 'Download failed');
                    setDownloading(false);
                    return;
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                link.href = url;
                link.download = metadata.fileName;
                link.click();
                window.URL.revokeObjectURL(url);
            } catch {
                setPasswordError('Download failed');
                setDownloading(false);
                return;
            }
        } else {
            // For non-protected files, direct download
            window.location.href = `http://localhost:5000/api/files/download/${fileId}`;
        }

        // Handle self-destruct
        if (metadata?.selfDestruct) {
            setTimeout(() => {
                setError('This was a self-destructing file. It has been deleted.');
                setErrorType('deleted');
                setMetadata(null);
            }, 3000);
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
        const date = new Date(expiresAt);
        const now = new Date();
        const diff = date - now;

        if (diff <= 0) return 'Expired';

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
        if (minutes > 0) return `${minutes} min left`;
        return 'Less than a minute';
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <Link to="/">
                            <h1 className="text-3xl font-bold text-white hover:text-slate-300 transition-colors">
                                QuickDrop
                            </h1>
                        </Link>
                    </div>

                    {/* Error State */}
                    {error && (
                        <div className="text-center space-y-5">
                            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${errorType === 'expired' ? 'bg-amber-500/10' : 'bg-red-500/10'
                                }`}>
                                {errorType === 'expired' ? (
                                    <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                )}
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    {errorType === 'expired' ? 'File Expired' : errorType === 'deleted' ? 'File Deleted' : 'File Not Found'}
                                </h2>
                                <p className="text-slate-500 text-sm mt-2">{error}</p>
                            </div>
                            <Link to="/" className="inline-block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors">
                                Upload a File
                            </Link>
                        </div>
                    )}

                    {/* Loading State */}
                    {!error && !metadata && (
                        <div className="text-center py-8">
                            <div className="w-10 h-10 mx-auto border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-slate-500 mt-4 text-sm">Loading...</p>
                        </div>
                    )}

                    {/* File Ready State */}
                    {metadata && (
                        <div className="text-center space-y-5">
                            {/* File Icon */}
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

                            {/* File Info */}
                            <div>
                                <h2 className="text-lg font-semibold text-white break-all">{metadata.fileName}</h2>
                                <p className="text-slate-500 text-sm mt-1">{formatFileSize(metadata.fileSize)}</p>

                                <div className="mt-3 flex items-center justify-center gap-2 text-xs flex-wrap">
                                    {metadata.selfDestruct && (
                                        <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-md">
                                            ⚠️ Self-destructs
                                        </span>
                                    )}
                                    {metadata.expiresAt && (
                                        <span className="px-2 py-1 bg-slate-800 text-slate-400 rounded-md">
                                            ⏱️ {formatExpiry(metadata.expiresAt)}
                                        </span>
                                    )}
                                    {metadata.passwordProtected && (
                                        <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded-md">
                                            🔒 Password protected
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Password Input */}
                            {needsPassword && (
                                <div className="space-y-2">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                        placeholder="Enter password"
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
                                    />
                                    {passwordError && (
                                        <p className="text-red-400 text-sm">{passwordError}</p>
                                    )}
                                </div>
                            )}

                            {/* Download Button */}
                            <button
                                onClick={handleDownload}
                                disabled={downloading}
                                className={`w-full py-3 bg-blue-600 text-white font-medium rounded-xl transition-colors ${downloading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-blue-500'
                                    }`}
                            >
                                {downloading ? 'Downloading...' : 'Download'}
                            </button>

                            <Link to="/" className="inline-block text-slate-500 hover:text-slate-300 transition-colors text-sm">
                                Share your own file →
                            </Link>
                        </div>
                    )}
                </div>

                <p className="text-center text-slate-600 text-xs mt-5">
                    No limits • No registration
                </p>
            </div>
        </div>
    );
}
