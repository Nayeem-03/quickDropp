import { useState, useEffect } from 'react';
import { UploadManager } from '../services/UploadManager';

const EXPIRY_OPTIONS = [
    { value: 'self-destruct', label: 'Self Destruct', description: 'Deleted after first download' },
    { value: '5m', label: '5 Minutes', ms: 5 * 60 * 1000 },
    { value: '30m', label: '30 Minutes', ms: 30 * 60 * 1000 },
    { value: '1d', label: '1 Day', ms: 24 * 60 * 60 * 1000 },
    { value: '7d', label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
    { value: 'forever', label: 'Forever', description: 'Never expires' },
    { value: 'custom', label: 'Custom', description: 'Set your own time' },
];

export function UploadInterface() {
    const [file, setFile] = useState(null);
    const [uploadState, setUploadState] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [uploadedBytes, setUploadedBytes] = useState(0);
    const [totalBytes, setTotalBytes] = useState(0);
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [uploadManager] = useState(() => new UploadManager());
    const [isDragging, setIsDragging] = useState(false);

    // Resume state
    const [pendingUpload, setPendingUpload] = useState(null);

    // Settings / Options
    const [showSettings, setShowSettings] = useState(false);
    const [expiry, setExpiry] = useState('7d');
    const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
    const [customValue, setCustomValue] = useState('');
    const [customUnit, setCustomUnit] = useState('minutes');
    const [enablePassword, setEnablePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [enableScheduledAccess, setEnableScheduledAccess] = useState(false);
    const [releaseDate, setReleaseDate] = useState('');

    useEffect(() => {
        const pending = UploadManager.hasPendingUpload();
        if (pending) setPendingUpload(pending);
    }, []);

    useEffect(() => {
        const handleOffline = () => {
            if (uploadState === 'uploading') {
                uploadManager.pause();
                setUploadState('paused');
            }
        };

        const handleOnline = () => {
            if (uploadState === 'paused' && file) {
                const pending = UploadManager.hasPendingUpload();
                if (pending && UploadManager.fileMatchesPending(file, pending)) {
                    setUploadState('uploading');
                    setUploadSpeed(0);
                    uploadManager.onProgress = ({ uploadedChunks, totalChunks, speed, bytesUploaded, totalBytes }) => {
                        setProgress(Math.round((uploadedChunks / totalChunks) * 100));
                        if (speed) setUploadSpeed(speed);
                        if (bytesUploaded !== undefined) setUploadedBytes(bytesUploaded);
                        if (totalBytes !== undefined) setTotalBytes(totalBytes);
                    };
                    uploadManager.resumeUpload(file, uploadManager.onProgress)
                        .then(result => {
                            if (result.success) {
                                setShareLink(result.shareLink);
                                setUploadState('completed');
                                setPendingUpload(null);
                            }
                        })
                        .catch(() => setUploadState('paused'));
                }
            }
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [uploadState, file, uploadManager]);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            if (pendingUpload && UploadManager.fileMatchesPending(selectedFile, pendingUpload)) {
                setUploadState('resumable');
                const resumeProgress = Math.round((pendingUpload.completedParts?.length / pendingUpload.totalParts) * 100);
                setProgress(resumeProgress);
            } else {
                setUploadState('ready');
                setPendingUpload(null);
            }
        }
    };

    const handleFolderSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        setUploadState('compressing');
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            for (const file of files) {
                const path = file.webkitRelativePath || file.name;
                zip.file(path, file);
            }
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
            const folderName = files[0].webkitRelativePath.split('/')[0];
            const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });
            setFile(zipFile);
            setUploadState('ready');
        } catch {
            setUploadState('idle');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            setFile(droppedFile);
            setUploadState('ready');
        }
    };

    const getExpiryMs = () => {
        if (expiry === 'self-destruct') return -1;
        if (expiry === 'forever') return 0;
        if (expiry === 'custom') {
            const val = parseInt(customValue) || 0;
            return customUnit === 'minutes' ? val * 60 * 1000 : val * 60 * 60 * 1000;
        }
        return EXPIRY_OPTIONS.find(o => o.value === expiry)?.ms || 0;
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploadState('uploading');
        setUploadSpeed(0);
        uploadManager.onProgress = ({ uploadedChunks, totalChunks, speed, bytesUploaded, totalBytes }) => {
            setProgress(Math.round((uploadedChunks / totalChunks) * 100));
            if (speed) setUploadSpeed(speed);
            if (bytesUploaded !== undefined) setUploadedBytes(bytesUploaded);
            if (totalBytes !== undefined) setTotalBytes(totalBytes);
        };
        const result = await uploadManager.uploadFile(file, {
            expiryMs: getExpiryMs(),
            selfDestruct: expiry === 'self-destruct',
            password: enablePassword && password ? password : null,
            releaseDate: enableScheduledAccess && releaseDate ? new Date(releaseDate).toISOString() : null
        });
        if (result.success) {
            setShareLink(result.shareLink);
            setUploadState('completed');
        }
    };

    const handleResume = async () => {
        if (!file) return;
        const pending = pendingUpload || UploadManager.hasPendingUpload();
        if (!pending || !UploadManager.fileMatchesPending(file, pending)) {
            setUploadState('ready');
            return;
        }
        setUploadState('uploading');
        setUploadSpeed(0);
        uploadManager.onProgress = ({ uploadedChunks, totalChunks, speed, bytesUploaded, totalBytes }) => {
            setProgress(Math.round((uploadedChunks / totalChunks) * 100));
            if (speed) setUploadSpeed(speed);
            if (bytesUploaded !== undefined) setUploadedBytes(bytesUploaded);
            if (totalBytes !== undefined) setTotalBytes(totalBytes);
        };
        try {
            const result = await uploadManager.resumeUpload(file, uploadManager.onProgress);
            if (result.success) {
                setShareLink(result.shareLink);
                setUploadState('completed');
                setPendingUpload(null);
            }
        } catch {
            setUploadState('ready');
            setPendingUpload(null);
            UploadManager.clearPendingUpload();
        }
    };

    const dismissPendingUpload = () => {
        UploadManager.clearPendingUpload();
        setPendingUpload(null);
    };

    const handleCancel = () => {
        uploadManager.cancel();
        UploadManager.clearPendingUpload();
        setUploadState('idle'); // Back to idle to allow fresh start
        setProgress(0);
        setFile(null);
        setPendingUpload(null);
        setUploadedBytes(0);
        setTotalBytes(0);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatSpeed = (bps) => {
        if (!bps) return '0 KB/s';
        const k = 1024;
        if (bps < k) return bps.toFixed(0) + ' B/s';
        if (bps < k * k) return (bps / k).toFixed(1) + ' KB/s';
        if (bps < k * k * k) return (bps / (k * k)).toFixed(1) + ' MB/s';
        return (bps / (k * k * k)).toFixed(2) + ' GB/s';
    };

    const resetUpload = () => {
        setFile(null);
        setUploadState('idle');
        setProgress(0);
        setShareLink('');
        setPassword('');
        setEnablePassword(false);
        setUploadedBytes(0);
        setTotalBytes(0);
    };

    const getSelectedLabel = () => {
        if (expiry === 'custom') return customValue ? `${customValue} ${customUnit}` : 'Custom';
        return EXPIRY_OPTIONS.find(o => o.value === expiry)?.label || '7 Days';
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className={`w-full max-w-sm transition-all duration-500 ease-out ${uploadState === 'completed' ? 'scale-100' : 'scale-100'}`}>

                {/* Minimal Header */}
                <div className="text-center mb-8">
                    <h1 className="text-xl font-bold tracking-tight text-neutral-200">QuickDrop</h1>
                </div>

                {/* Main Card */}
                <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 shadow-2xl shadow-black/50 relative overflow-hidden group">

                    {/* Glass sheen effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    {/* Pending Upload Alert */}
                    {pendingUpload && uploadState === 'idle' && (
                        <div className="mb-6 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-center justify-between animate-fade-in">
                            <span className="text-amber-200 text-xs font-medium truncate flex-1 mr-2">
                                Unfinished upload: {pendingUpload.fileName}
                            </span>
                            <button onClick={dismissPendingUpload} className="text-amber-500 hover:text-amber-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </div>
                    )}

                    {/* IDLE / READY STATE */}
                    {(uploadState === 'idle' || uploadState === 'ready' || uploadState === 'resumable') && (
                        <div className="animate-fade-in">
                            <div
                                className={`relative border border-dashed rounded-xl h-48 flex flex-col items-center justify-center text-center transition-all duration-300
                                    ${isDragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/50'}`}
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                            >
                                <input id="file-input" type="file" onChange={handleFileSelect} className="hidden" />
                                <input id="folder-input" type="file" webkitdirectory="" directory="" multiple onChange={handleFolderSelect} className="hidden" />

                                {file ? (
                                    <div className="px-4">
                                        <div className="w-10 h-10 mx-auto mb-3 bg-neutral-800 rounded-lg flex items-center justify-center text-indigo-400">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        <p className="text-neutral-200 font-medium text-sm truncate max-w-[200px]">{file.name}</p>
                                        <p className="text-neutral-500 text-xs mt-1">{formatFileSize(file.size)}</p>
                                        <button onClick={() => setFile(null)} className="mt-3 text-xs text-neutral-500 hover:text-red-400 transition-colors">Change file</button>
                                    </div>
                                ) : (
                                    <>
                                        <button onClick={() => document.getElementById('file-input').click()} className="absolute inset-0 z-10 w-full h-full cursor-pointer" />
                                        <div className="pointer-events-none">
                                            <svg className="w-8 h-8 mx-auto text-neutral-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                            <p className="text-sm text-neutral-400 font-medium">Drop file to upload</p>
                                            <p className="text-xs text-neutral-600 mt-1">or click to browse</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Actions / Settings Toggle */}
                            <div className="mt-4 flex items-center justify-between">
                                <button
                                    onClick={() => document.getElementById('folder-input').click()}
                                    className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                                >
                                    Upload folder
                                </button>
                                {file && (
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className={`flex items-center gap-1.5 text-xs transition-colors ${showSettings ? 'text-indigo-400' : 'text-neutral-500 hover:text-neutral-300'}`}
                                    >
                                        <span>Settings</span>
                                        <svg className={`w-3.5 h-3.5 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                )}
                            </div>

                            {/* Collapsible Settings */}
                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showSettings && file ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                                <div className="space-y-4 p-4 bg-neutral-900/30 rounded-xl border border-neutral-800/50">
                                    {/* Expiry */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-neutral-400">Expires</span>
                                        <select
                                            value={expiry}
                                            onChange={(e) => setExpiry(e.target.value)}
                                            className="bg-transparent text-xs text-indigo-400 outline-none cursor-pointer text-right"
                                        >
                                            {EXPIRY_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="bg-neutral-900 text-neutral-300">{opt.label}</option>)}
                                        </select>
                                    </div>

                                    {/* Password Toggle */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-neutral-400">Password</span>
                                            <button onClick={() => setEnablePassword(!enablePassword)} className={`w-8 h-4 rounded-full relative transition-colors ${enablePassword ? 'bg-indigo-500' : 'bg-neutral-700'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${enablePassword ? 'left-4.5' : 'left-0.5'}`} />
                                            </button>
                                        </div>
                                        {enablePassword && (
                                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Secret password"
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500/50" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Main Action Button */}
                            {file && (
                                <button
                                    onClick={uploadState === 'resumable' ? handleResume : handleUpload}
                                    disabled={enablePassword && !password}
                                    className={`w-full mt-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 
                                        ${enablePassword && !password ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'}`}
                                >
                                    {uploadState === 'resumable' ? 'Resume Upload' : 'Upload File'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* UPLOADING STATE */}
                    {(uploadState === 'uploading' || uploadState === 'paused' || uploadState === 'compressing') && (
                        <div className="animate-fade-in text-center py-4">
                            <div className="mb-6 relative w-24 h-24 mx-auto flex items-center justify-center">
                                <svg className="w-full h-full -rotate-90 text-neutral-800" viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" />
                                </svg>
                                <svg className="absolute top-0 left-0 w-full h-full -rotate-90 text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" viewBox="0 0 36 36">
                                    <path
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeDasharray={`${progress}, 100`}
                                    />
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                    <span className="text-xl font-bold text-white">{progress}%</span>
                                </div>
                            </div>

                            <h3 className="text-neutral-200 font-medium text-sm mb-1">
                                {uploadState === 'compressing' ? 'Zipping files...' : uploadState === 'paused' ? 'Connection Lost' : 'Uploading...'}
                            </h3>
                            <p className="text-neutral-500 text-xs mb-6 font-mono">
                                {uploadState === 'paused' ? 'Waiting for internet...' : `${formatFileSize(uploadedBytes)} / ${formatFileSize(totalBytes)}`}
                            </p>

                            <button onClick={handleCancel} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* COMPLETED STATE */}
                    {uploadState === 'completed' && (
                        <div className="animate-fade-in text-center py-2">
                            <div className="w-12 h-12 mx-auto bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 text-indigo-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>

                            <h2 className="text-lg font-bold text-white mb-1">Link Ready</h2>
                            <p className="text-neutral-500 text-xs mb-6">File uploaded successfully</p>

                            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-1 pr-2 mb-4">
                                <input type="text" readOnly value={shareLink} className="flex-1 bg-transparent border-none text-xs text-neutral-300 px-3 outline-none" />
                                <button
                                    onClick={handleCopy}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-emerald-500 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
                                >
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => window.location.href = `/analytics/${uploadManager.fileId}`} className="py-2.5 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 text-xs font-medium transition-colors">
                                    Analytics
                                </button>
                                <button onClick={resetUpload} className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-lg shadow-indigo-900/20">
                                    Send Another
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-neutral-700 text-[10px] mt-8 tracking-widest uppercase">
                    Simple • Private • Fast
                </p>
            </div>
        </div>
    );
}
