import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export function ReplaceFilePage() {
    const { fileId } = useParams();
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [uploadState, setUploadState] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState(null);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setUploadState('ready');
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

    const handleReplace = async () => {
        if (!file) return;

        setUploadState('uploading');
        setError(null);

        try {
            // Call replace API
            const response = await fetch(`${API_URL}/api/replace/${fileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type
                })
            });

            if (!response.ok) throw new Error('Failed to initialize replacement');

            const uploadData = await response.json();

            // Upload the new file
            if (uploadData.multipart) {
                // Multipart upload
                const partUrls = uploadData.partUrls;
                const chunkSize = uploadData.chunkSize;
                const uploadedParts = [];

                for (let i = 0; i < partUrls.length; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    const chunk = file.slice(start, end);

                    const uploadResponse = await fetch(partUrls[i].url, {
                        method: 'PUT',
                        body: chunk,
                        headers: { 'Content-Type': file.type }
                    });

                    if (!uploadResponse.ok) throw new Error(`Failed to upload part ${i + 1}`);

                    const etag = uploadResponse.headers.get('ETag');
                    uploadedParts.push({
                        PartNumber: partUrls[i].partNumber,
                        ETag: etag.replace(/"/g, '')
                    });

                    setProgress(Math.round(((i + 1) / partUrls.length) * 100));
                }

                // Complete multipart upload
                await fetch(`${API_URL}/api/upload/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileId: uploadData.linkId,
                        uploadId: uploadData.uploadId,
                        parts: uploadedParts
                    })
                });
            } else {
                // Single file upload
                const uploadResponse = await fetch(uploadData.uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type }
                });

                if (!uploadResponse.ok) throw new Error('Failed to upload file');
                setProgress(100);
            }

            setUploadState('completed');
        } catch (err) {
            console.error('Replace error:', err);
            setError(err.message);
            setUploadState('error');
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white">Replace File</h1>
                        <p className="text-slate-500 mt-1 text-sm">Upload a new version without changing the link</p>
                    </div>

                    {uploadState === 'idle' || uploadState === 'ready' ? (
                        <>
                            {/* Upload Zone */}
                            <div
                                className={`relative border-2 border-dashed rounded-xl p-8 transition-colors mb-6
                                    ${isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600'}`}
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                            >
                                <input
                                    type="file"
                                    id="file-input"
                                    onChange={handleFileSelect}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />

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
                                    <div className="text-center">
                                        <div className="w-14 h-14 mx-auto mb-3 bg-slate-800 rounded-xl flex items-center justify-center">
                                            <svg className="w-7 h-7 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>
                                        <p className="text-slate-300 font-medium">Drop replacement file here</p>
                                        <p className="text-slate-500 text-sm mt-1">or click to browse</p>
                                    </div>
                                )}
                            </div>

                            {file && (
                                <button
                                    onClick={handleReplace}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
                                >
                                    Replace File
                                </button>
                            )}

                            <button
                                onClick={() => navigate('/')}
                                className="w-full mt-3 py-2.5 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white font-medium rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </>
                    ) : uploadState === 'uploading' ? (
                        <div className="space-y-5">
                            <div className="text-center">
                                <p className="text-white font-medium mb-1">Replacing file...</p>
                                <p className="text-slate-500 text-sm truncate">{file?.name}</p>
                            </div>

                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-center text-slate-400 text-sm">{progress}%</p>
                        </div>
                    ) : uploadState === 'completed' ? (
                        <div className="text-center space-y-5">
                            <div className="w-16 h-16 mx-auto bg-emerald-500/10 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <div>
                                <h2 className="text-xl font-semibold text-white">File Replaced!</h2>
                                <p className="text-slate-500 text-sm mt-1">Your link still works with the new file</p>
                            </div>

                            <button
                                onClick={() => navigate('/')}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <div className="text-center space-y-4">
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={() => { setUploadState('idle'); setError(null); }}
                                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
