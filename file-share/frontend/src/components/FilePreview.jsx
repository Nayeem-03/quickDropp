import { useState, useEffect } from 'react';

export function FilePreview({ previewUrl, fileName, mimeType, onClose }) {
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-900 rounded-2xl border border-slate-800 max-w-5xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold truncate">{fileName}</h3>
                        <p className="text-slate-500 text-sm">{mimeType}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Preview Content */}
                <div className="relative bg-slate-950 overflow-auto max-h-[calc(90vh-80px)]">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
                        </div>
                    )}

                    {error && (
                        <div className="p-12 text-center">
                            <p className="text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Image Preview */}
                    {isImage && (
                        <img
                            src={previewUrl}
                            alt={fileName}
                            className="w-full h-auto"
                            onLoad={handleLoad}
                            onError={handleError}
                        />
                    )}

                    {/* Video Preview */}
                    {isVideo && (
                        <video
                            src={previewUrl}
                            controls
                            className="w-full h-auto"
                            onLoadedData={handleLoad}
                            onError={handleError}
                        >
                            Your browser doesn't support video playback.
                        </video>
                    )}

                    {/* Audio Preview */}
                    {isAudio && (
                        <div className="p-12">
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
                            className="w-full h-[calc(90vh-80px)]"
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
                    {!isImage && !isVideo && !isAudio && !isPDF && !isText && (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-xl flex items-center justify-center">
                                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <p className="text-slate-400">Preview not available for this file type</p>
                            <p className="text-slate-600 text-sm mt-2">Download the file to view it</p>
                        </div>
                    )}
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
        <div className="p-6">
            <pre className="text-slate-300 text-sm font-mono whitespace-pre-wrap break-words bg-slate-900 p-4 rounded-lg overflow-auto max-h-[70vh]">
                {content}
            </pre>
        </div>
    );
}
