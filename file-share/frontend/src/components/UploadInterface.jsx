import { useState } from 'react';
import { UploadManager } from '../services/UploadManager';
import './UploadInterface.css';

export function UploadInterface() {
    const [file, setFile] = useState(null);
    const [uploadState, setUploadState] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [uploadManager] = useState(() => new UploadManager());

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setUploadState('ready');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            setFile(droppedFile);
            setUploadState('ready');
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploadState('uploading');

        uploadManager.onProgress = ({ uploadedChunks, totalChunks }) => {
            setProgress(Math.round((uploadedChunks / totalChunks) * 100));
        };

        const result = await uploadManager.uploadFile(file);

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
        setUploadState('idle');  // Reset to idle so upload zone shows
        setProgress(0);
        setFile(null);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="upload-container">
            <div className="upload-card">
                <div className="brand">
                    <h1 className="logo">FastShare</h1>
                    <p className="tagline">Lightning-fast file sharing ⚡</p>
                </div>

                {uploadState === 'idle' || uploadState === 'ready' ? (
                    <div
                        className="upload-zone"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <input
                            type="file"
                            id="file-input"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="file-input" className="upload-label">
                            {file ? (
                                <div className="file-info">
                                    <div className="file-icon">📄</div>
                                    <div className="file-details">
                                        <p className="file-name">{file.name}</p>
                                        <p className="file-size">{formatFileSize(file.size)}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="upload-prompt">
                                    <div className="upload-icon">☁️</div>
                                    <p className="prompt-text">Drop your file here or click to browse</p>
                                    <p className="prompt-hint">No size limits • No registration required</p>
                                </div>
                            )}
                        </label>

                        {file && (
                            <button onClick={handleUpload} className="btn-upload">
                                Start Upload 🚀
                            </button>
                        )}
                    </div>
                ) : null}

                {(uploadState === 'uploading' || uploadState === 'paused') && (
                    <div className="progress-section">
                        <div className="progress-header">
                            <span className="progress-label">
                                {uploadState === 'paused' ? '⏸️ Paused' : '⬆️ Uploading'}
                            </span>
                            <span className="progress-percent">{progress}%</span>
                        </div>

                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <div className="upload-controls">
                            {uploadState === 'uploading' ? (
                                <>
                                    <button onClick={handlePause} className="btn-control">
                                        ⏸️ Pause
                                    </button>
                                    <button onClick={handleCancel} className="btn-control btn-danger">
                                        ❌ Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={handleResume} className="btn-control btn-primary">
                                        ▶️ Resume
                                    </button>
                                    <button onClick={handleCancel} className="btn-control btn-danger">
                                        ❌ Cancel
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {uploadState === 'completed' && (
                    <div className="success-section">
                        <div className="success-icon">✅</div>
                        <h2 className="success-title">Upload Complete!</h2>

                        <div className="share-box">
                            <input
                                type="text"
                                value={shareLink}
                                readOnly
                                className="share-input"
                            />
                            <button
                                onClick={handleCopy}
                                className={`btn-copy ${copied ? 'copied' : ''}`}
                            >
                                {copied ? '✅ Copied!' : '📋 Copy'}
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                setFile(null);
                                setUploadState('idle');
                                setProgress(0);
                                setShareLink('');
                            }}
                            className="btn-another"
                        >
                            Upload Another File
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
