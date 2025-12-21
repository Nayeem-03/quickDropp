import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './UploadInterface.css'; // Reusing styles

export function DownloadPage() {
    const { fileId } = useParams();
    const [metadata, setMetadata] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(`http://localhost:5000/api/files/${fileId}`)
            .then(res => {
                if (!res.ok) throw new Error('File not found');
                return res.json();
            })
            .then(data => setMetadata(data))
            .catch(err => setError(err.message));
    }, [fileId]);

    const handleDownload = () => {
        // Direct download from backend
        window.location.href = `http://localhost:5000/api/files/download/${fileId}`;
    };

    if (error) {
        return (
            <div className="upload-container">
                <div className="upload-card">
                    <div className="brand">
                        <h1 className="logo">FastShare</h1>
                    </div>
                    <div className="error-message" style={{ textAlign: 'center', color: '#f56565' }}>
                        <h2>⚠️ {error}</h2>
                        <p>The file may have been deleted or the link is invalid.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="upload-container">
            <div className="upload-card">
                <div className="brand">
                    <h1 className="logo">FastShare</h1>
                    <p className="tagline">Ready to download 📥</p>
                </div>

                {metadata ? (
                    <div className="success-section">
                        <div className="file-info" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
                            <div className="file-icon">📄</div>
                            <div className="file-details" style={{ flex: 'initial' }}>
                                <p className="file-name" style={{ fontSize: '1.5rem' }}>{metadata.fileName}</p>
                                <p className="file-size">{formatFileSize(metadata.fileSize)}</p>
                            </div>
                        </div>

                        <button onClick={handleDownload} className="btn-upload">
                            Download File 🚀
                        </button>
                    </div>
                ) : (
                    <div className="upload-prompt">
                        <p>Loading file info...</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
