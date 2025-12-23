import { useState } from 'react';
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
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [uploadManager] = useState(() => new UploadManager());
    const [isDragging, setIsDragging] = useState(false);

    // Expiry state
    const [expiry, setExpiry] = useState('7d');
    const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
    const [customValue, setCustomValue] = useState('');
    const [customUnit, setCustomUnit] = useState('minutes');

    // Password state
    const [enablePassword, setEnablePassword] = useState(false);
    const [password, setPassword] = useState('');

    // Scheduled Access state
    const [enableScheduledAccess, setEnableScheduledAccess] = useState(false);
    const [releaseDate, setReleaseDate] = useState('');

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setUploadState('ready');
        }
    };

    const handleFolderSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploadState('compressing');

        try {
            // Dynamically import JSZip
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();

            // Add all files to zip maintaining folder structure
            for (const file of files) {
                const path = file.webkitRelativePath || file.name;
                zip.file(path, file);
            }

            // Generate ZIP file
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            // Get folder name from first file's path
            const folderName = files[0].webkitRelativePath.split('/')[0];
            const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });

            setFile(zipFile);
            setUploadState('ready');
        } catch (error) {
            console.error('Folder compression error:', error);
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
            if (customUnit === 'minutes') return val * 60 * 1000;
            if (customUnit === 'hours') return val * 60 * 60 * 1000;
            return 0;
        }
        return EXPIRY_OPTIONS.find(o => o.value === expiry)?.ms || 0;
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploadState('uploading');

        uploadManager.onProgress = ({ uploadedChunks, totalChunks }) => {
            setProgress(Math.round((uploadedChunks / totalChunks) * 100));
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

    const handlePause = () => {
        uploadManager.pause();
        setUploadState('paused');
    };

    const handleResume = () => {
        uploadManager.resume();
        setUploadState('uploading');
    };

    const handleCancel = () => {
        uploadManager.cancel();
        setUploadState('idle');
        setProgress(0);
        setFile(null);
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

    const resetUpload = () => {
        setFile(null);
        setUploadState('idle');
        setProgress(0);
        setShareLink('');
        setPassword('');
        setEnablePassword(false);
    };

    const getSelectedLabel = () => {
        if (expiry === 'custom') {
            return customValue ? `${customValue} ${customUnit}` : 'Custom';
        }
        return EXPIRY_OPTIONS.find(o => o.value === expiry)?.label || '7 Days';
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-white">QuickDrop</h1>
                        <p className="text-slate-500 mt-1 text-sm">Fast & simple file sharing</p>
                    </div>

                    {/* Upload Zone */}
                    {(uploadState === 'idle' || uploadState === 'ready') && (
                        <>
                            <div
                                className={`relative border-2 border-dashed rounded-xl p-8 transition-colors
                                    ${isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600'}`}
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                            >

                                {file ? (
                                    <div className="text-center">
                                        <div className="w-14 h-14 mx-auto mb-3 bg-slate-800 rounded-xl flex items-center justify-center">
                                            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <p className="text-white font-medium truncate">{file.name}</p>
                                        <p className="text-slate-500 text-sm mt-1">{formatFileSize(file.size)}</p>
                                    </div>
                                ) : (
                                    <div className="text-center space-y-6">
                                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>

                                        <div>
                                            <h2 className="text-2xl font-bold text-white mb-2">Drop your file here</h2>
                                            <p className="text-slate-400">or click to browse</p>
                                        </div>

                                        <div className="flex gap-3 justify-center">
                                            <button
                                                onClick={() => document.getElementById('file-input-btn').click()}
                                                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all hover:scale-105"
                                            >
                                                📄 Choose File
                                            </button>
                                            <button
                                                onClick={() => document.getElementById('folder-input').click()}
                                                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl transition-all hover:scale-105"
                                            >
                                                📁 Choose Folder
                                            </button>
                                        </div>

                                        <input
                                            id="file-input-btn"
                                            type="file"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                        <input
                                            id="folder-input"
                                            type="file"
                                            webkitdirectory=""
                                            directory=""
                                            multiple
                                            onChange={handleFolderSelect}
                                            className="hidden"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Options */}
                            {file && (
                                <div className="mt-5 space-y-4">
                                    {/* Expiry Selector */}
                                    <div>
                                        <label className="block text-slate-400 text-sm mb-2">Expires after</label>
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowExpiryDropdown(!showExpiryDropdown)}
                                                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-left text-white flex items-center justify-between hover:border-slate-600 transition-colors"
                                            >
                                                <span>{getSelectedLabel()}</span>
                                                <svg className={`w-5 h-5 text-slate-400 transition-transform ${showExpiryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {showExpiryDropdown && (
                                                <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                                                    {EXPIRY_OPTIONS.map((option) => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => {
                                                                setExpiry(option.value);
                                                                if (option.value !== 'custom') setShowExpiryDropdown(false);
                                                            }}
                                                            className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors flex items-center justify-between
                                                                ${expiry === option.value ? 'bg-slate-700' : ''}`}
                                                        >
                                                            <div>
                                                                <span className="text-white">{option.label}</span>
                                                                {option.description && (
                                                                    <p className="text-slate-500 text-xs mt-0.5">{option.description}</p>
                                                                )}
                                                            </div>
                                                            {expiry === option.value && (
                                                                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    ))}

                                                    {expiry === 'custom' && (
                                                        <div className="p-3 border-t border-slate-700">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="number"
                                                                    value={customValue}
                                                                    onChange={(e) => setCustomValue(e.target.value)}
                                                                    placeholder="Value"
                                                                    min="1"
                                                                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 outline-none focus:border-blue-500"
                                                                />
                                                                <select
                                                                    value={customUnit}
                                                                    onChange={(e) => setCustomUnit(e.target.value)}
                                                                    className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white outline-none focus:border-blue-500"
                                                                >
                                                                    <option value="minutes">Minutes</option>
                                                                    <option value="hours">Hours</option>
                                                                </select>
                                                            </div>
                                                            <button
                                                                onClick={() => setShowExpiryDropdown(false)}
                                                                className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                                                            >
                                                                Confirm
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Password Protection */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-slate-400 text-sm">Password protect</label>
                                            <button
                                                onClick={() => setEnablePassword(!enablePassword)}
                                                className={`w-10 h-6 rounded-full transition-colors relative ${enablePassword ? 'bg-blue-600' : 'bg-slate-700'}`}
                                            >
                                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${enablePassword ? 'left-5' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        {enablePassword && (
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter password"
                                                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
                                            />
                                        )}
                                    </div>

                                    {/* Scheduled Access */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-slate-400 text-sm">Scheduled access</label>
                                            <button
                                                onClick={() => setEnableScheduledAccess(!enableScheduledAccess)}
                                                className={`w-10 h-6 rounded-full transition-colors relative ${enableScheduledAccess ? 'bg-blue-600' : 'bg-slate-700'}`}
                                            >
                                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${enableScheduledAccess ? 'left-5' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        {enableScheduledAccess && (
                                            <div>
                                                <input
                                                    type="datetime-local"
                                                    value={releaseDate}
                                                    onChange={(e) => setReleaseDate(e.target.value)}
                                                    min={new Date().toISOString().slice(0, 16)}
                                                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-blue-500 transition-colors"
                                                />
                                                <p className="text-xs text-slate-500 mt-2">File will be accessible after this date/time</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Upload Button */}
                    {file && uploadState === 'ready' && (
                        <button
                            onClick={handleUpload}
                            disabled={enablePassword && !password}
                            className={`w-full mt-5 py-3 bg-blue-600 text-white font-medium rounded-xl transition-colors
                                ${enablePassword && !password ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`}
                        >
                            Upload
                        </button>
                    )}

                    {/* Progress Section */}
                    {(uploadState === 'uploading' || uploadState === 'paused') && (
                        <div className="space-y-5">
                            <div className="text-center">
                                <p className="text-white font-medium mb-1">
                                    {uploadState === 'paused' ? 'Paused' : 'Uploading...'}
                                </p>
                                <p className="text-slate-500 text-sm truncate">{file?.name}</p>
                            </div>

                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-center text-slate-400 text-sm">{progress}%</p>

                            <div className="flex gap-3">
                                {uploadState === 'uploading' ? (
                                    <button onClick={handlePause} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-colors">
                                        Pause
                                    </button>
                                ) : (
                                    <button onClick={handleResume} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors">
                                        Resume
                                    </button>
                                )}
                                <button onClick={handleCancel} className="flex-1 py-2.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 font-medium rounded-xl transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Success Section */}
                    {uploadState === 'completed' && (
                        <div className="text-center space-y-5">
                            <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <div>
                                <h2 className="text-xl font-semibold text-white">Upload Complete</h2>
                                <p className="text-slate-500 text-sm mt-1">Share this link</p>
                            </div>

                            <div className="flex gap-2 p-1.5 bg-slate-800 rounded-lg">
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    className="flex-1 bg-transparent text-slate-300 text-sm px-3 outline-none truncate"
                                />
                                <button
                                    onClick={handleCopy}
                                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${copied ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                                        }`}
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>

                            <button
                                onClick={() => window.location.href = `/analytics/${uploadManager.fileId}`}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
                            >
                                📊 View Analytics
                            </button>

                            <button
                                onClick={resetUpload}
                                className="w-full py-2.5 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white font-medium rounded-xl transition-colors"
                            >
                                Upload Another
                            </button>
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
