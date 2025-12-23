import { useState, useEffect } from 'react';

export function FilePreview({ previewUrl, fileName, mimeType, onClose, onDownload }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const isImage = mimeType?.startsWith('image/');
    const isVideo = mimeType?.startsWith('video/');
    const isAudio = mimeType?.startsWith('audio/');
    const isPDF = mimeType === 'application/pdf';
    const isText = mimeType?.startsWith('text/') ||
        ['application/json', 'application/javascript'].includes(mimeType);

    const handleLoad = () => setLoading(false);
    const handleError = () => {
        setLoading(false);
        setError('Failed to load preview');
    };

    return (
        <div className="fixed inset-0 bg-neutral-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-[#0a0a0a] rounded-2xl border border-neutral-800 max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl shadow-black" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
                    <div className="flex-1 min-w-0 pr-4">
                        <h3 className="text-neutral-200 font-semibold truncate text-sm">{fileName}</h3>
                        <p className="text-neutral-500 text-xs font-mono mt-0.5">{mimeType}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-500 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Preview Content */}
                <div className="relative bg-[#050505] overflow-auto max-h-[calc(90vh-140px)] min-h-[300px] flex items-center justify-center">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#050505]">
                            <div className="w-8 h-8 border-2 border-neutral-800 border-t-indigo-500 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {error && (
                        <div className="p-12 text-center">
                            <div className="w-12 h-12 mx-auto bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-500">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Image Preview */}
                    {isImage && (
                        <img
                            src={previewUrl}
                            alt={fileName}
                            className={`max-w-full h-auto max-h-full object-contain transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
                            onLoad={handleLoad}
                            onError={handleError}
                        />
                    )}

                    {/* Video Preview */}
                    {isVideo && (
                        <video
                            src={previewUrl}
                            controls
                            className="max-w-full max-h-full"
                            onLoadedData={handleLoad}
                            onError={handleError}
                        >
                            Your browser doesn't support video playback.
                        </video>
                    )}

                    {/* Audio Preview */}
                    {isAudio && (
                        <div className="p-12 w-full max-w-md">
                            <audio
                                src={previewUrl}
                                controls
                                className="w-full"
                                onLoadedData={handleLoad}
                                onError={handleError}
                            >
                                Your browser doesn't support audio playback.
                            </audio>
                        </div>
                    )}

                    {/* PDF Preview */}
                    {isPDF && (
                        <iframe
                            src={previewUrl}
                            className="w-full h-[calc(90vh-140px)]"
                            onLoad={handleLoad}
                            onError={handleError}
                            title={fileName}
                        />
                    )}

                    {/* Text Preview */}
                    {isText && (
                        <TextPreview
                            url={previewUrl}
                            onLoad={handleLoad}
                            onError={handleError}
                        />
                    )}

                    {/* Unsupported */}
                    {!isImage && !isVideo && !isAudio && !isPDF && !isText && !loading && !error && (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-neutral-900 rounded-xl flex items-center justify-center border border-neutral-800">
                                <svg className="w-8 h-8 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <p className="text-neutral-400 font-medium text-sm">Preview not available</p>
                            <p className="text-neutral-600 text-xs mt-2">Download the file to view its contents</p>
                        </div>
                    )}
                </div>

                {/* Footer with Download Button */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-800 bg-neutral-900/50">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-neutral-400 hover:text-white transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onDownload}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-indigo-900/20 flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download File
                    </button>
                </div>
            </div>
        </div>
    );
}

// Text file preview component
function TextPreview({ url, onLoad, onError }) {
    const [content, setContent] = useState('');

    useEffect(() => {
        fetch(url)
            .then(res => res.text())
            .then(text => {
                setContent(text);
                onLoad();
            })
            .catch(() => onError());
    }, [url]);

    return (
        <div className="w-full h-full p-6 overflow-auto bg-[#050505]">
            <pre className="text-neutral-400 text-xs font-mono whitespace-pre-wrap break-words">
                {content}
            </pre>
        </div>
    );
}
