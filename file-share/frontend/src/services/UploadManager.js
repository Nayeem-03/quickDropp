import { API_URL } from '../config.js';

const STORAGE_KEY = 'quickdrop_pending_upload';

// Generate a unique fingerprint for a file
const getFileFingerprint = (file) => {
    return `${file.name}-${file.size}-${file.lastModified}`;
};

// Upload Manager - Direct to S3 with presigned URLs and Resume Support
export class UploadManager {
    constructor() {
        this.state = 'idle';
        this.abortController = null;
        this.fileId = null;
        this.pendingUpload = null;
    }

    reset() {
        this.state = 'idle';
        this.abortController = null;
        this.fileId = null;
        this.pendingUpload = null;
    }

    // Check if there's a pending upload that can be resumed
    static hasPendingUpload() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return null;

            const pending = JSON.parse(saved);
            // Check if the upload data is still valid (less than 1 hour old)
            if (Date.now() - pending.timestamp > 60 * 60 * 1000) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return pending;
        } catch {
            return null;
        }
    }

    // Clear pending upload from storage
    static clearPendingUpload() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // Save upload state to localStorage
    saveUploadState(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
        } catch {
            // Storage might be full, continue without persistence
        }
    }

    // Update just the completed parts in storage
    updateCompletedParts(parts) {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                data.completedParts = parts;
                data.timestamp = Date.now();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
        } catch {
            // Continue without persistence
        }
    }

    // Check if the provided file matches the pending upload
    static fileMatchesPending(file, pending) {
        return pending && getFileFingerprint(file) === pending.fingerprint;
    }

    // Resume an interrupted upload
    async resumeUpload(file, onProgress) {
        const pending = UploadManager.hasPendingUpload();

        if (!pending || !UploadManager.fileMatchesPending(file, pending)) {
            throw new Error('No matching pending upload found');
        }

        this.reset();
        this.abortController = new AbortController();
        this.fileId = pending.fileId;
        this.state = 'uploading';
        this.onProgress = onProgress;

        try {
            let parts = pending.completedParts || [];
            const completedPartNumbers = new Set(parts.map(p => p.PartNumber));

            // Filter out already completed parts
            const remainingPartUrls = pending.partUrls.filter(
                p => !completedPartNumbers.has(p.partNumber)
            );

            // Upload remaining parts
            if (remainingPartUrls.length > 0) {
                const newParts = await this.uploadMultipartResume(
                    file,
                    remainingPartUrls,
                    pending.chunkSize,
                    parts.length,
                    pending.totalParts
                );
                parts = [...parts, ...newParts];
            }

            if (this.state === 'cancelled' || this.state === 'paused') {
                return { success: false, cancelled: this.state === 'cancelled', paused: this.state === 'paused' };
            }

            // Complete the upload
            const completeResponse = await fetch(`${API_URL}/api/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: this.fileId,
                    uploadId: pending.uploadId,
                    parts: parts
                }),
                signal: this.abortController.signal
            });

            if (!completeResponse.ok) throw new Error('Failed to complete upload');

            const { shareLink, fileName } = await completeResponse.json();
            this.state = 'completed';

            // Clear pending upload on success
            UploadManager.clearPendingUpload();

            return { success: true, fileId: this.fileId, shareLink, fileName };

        } catch (error) {
            if (error.name === 'AbortError' || this.state === 'cancelled' || this.state === 'paused') {
                return { success: false, cancelled: this.state === 'cancelled', paused: this.state === 'paused' };
            }
            throw error;
        }
    }

    async uploadFile(file, options = {}) {
        this.reset();
        this.abortController = new AbortController();

        try {
            // 1. Initialize upload - get presigned URL(s)
            const initResponse = await fetch(`${API_URL}/api/upload/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || 'application/octet-stream',
                    expiryMs: options.expiryMs || 0,
                    selfDestruct: options.selfDestruct || false,
                    password: options.password || null,
                    releaseDate: options.releaseDate || null
                }),
                signal: this.abortController.signal
            });

            if (!initResponse.ok) throw new Error('Failed to initialize upload');

            const initData = await initResponse.json();
            this.fileId = initData.fileId;
            const uploadId = initData.uploadId;
            this.state = 'uploading';

            let parts = [];

            if (initData.multipart) {
                // Save state for potential resume (multipart only)
                this.saveUploadState({
                    fingerprint: getFileFingerprint(file),
                    fileId: initData.fileId,
                    s3Key: initData.s3Key,
                    uploadId: uploadId,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    partUrls: initData.partUrls,
                    chunkSize: initData.chunkSize,
                    totalParts: initData.partUrls.length,
                    completedParts: [],
                    options: options
                });

                // Multipart upload for large files
                parts = await this.uploadMultipart(file, initData.partUrls, initData.chunkSize);
            } else {
                // Single upload for small files (no resume needed, fast enough)
                await this.uploadSingle(file, initData.uploadUrl);
            }

            if (this.state === 'cancelled' || this.state === 'paused') {
                return { success: false, cancelled: this.state === 'cancelled', paused: this.state === 'paused' };
            }

            // 3. Complete upload
            const completeResponse = await fetch(`${API_URL}/api/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: this.fileId,
                    uploadId: uploadId,
                    parts: parts.length > 0 ? parts : undefined
                }),
                signal: this.abortController.signal
            });

            if (!completeResponse.ok) throw new Error('Failed to complete upload');

            const { shareLink, fileName } = await completeResponse.json();
            this.state = 'completed';

            // Clear pending upload on success
            UploadManager.clearPendingUpload();

            return { success: true, fileId: this.fileId, shareLink, fileName };

        } catch (error) {
            if (error.name === 'AbortError' || this.state === 'cancelled' || this.state === 'paused') {
                return { success: false, cancelled: this.state === 'cancelled', paused: this.state === 'paused' };
            }
            throw error;
        }
    }

    async uploadSingle(file, uploadUrl) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Store xhr for potential abort
            this.currentXhr = xhr;

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    this.onProgress?.({
                        uploadedChunks: percentComplete,
                        totalChunks: 100,
                        loaded: event.loaded,
                        total: event.total
                    });
                }
            };

            xhr.onload = () => {
                this.currentXhr = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                this.currentXhr = null;
                reject(new Error('Upload failed'));
            };

            xhr.onabort = () => {
                this.currentXhr = null;
                reject(new Error('Upload aborted'));
            };

            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.send(file);
        });
    }

    async uploadMultipart(file, partUrls, chunkSize) {
        const parts = [];
        const totalParts = partUrls.length;

        for (let i = 0; i < partUrls.length; i++) {
            if (this.state === 'cancelled' || this.state === 'paused') break;

            const { partNumber, url } = partUrls[i];
            const start = (partNumber - 1) * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);

            const response = await this.fetchWithRetry(url, {
                method: 'PUT',
                body: chunk,
                signal: this.abortController.signal
            });

            // Get ETag from response for completing multipart
            const etag = response.headers.get('ETag');
            parts.push({ PartNumber: partNumber, ETag: etag });

            // Save progress after each successful part
            this.updateCompletedParts(parts);

            this.onProgress?.({ uploadedChunks: i + 1, totalChunks: totalParts });
        }

        return parts;
    }

    // Resume version of multipart upload (starts from offset)
    async uploadMultipartResume(file, remainingPartUrls, chunkSize, completedCount, totalParts) {
        const parts = [];

        for (let i = 0; i < remainingPartUrls.length; i++) {
            if (this.state === 'cancelled' || this.state === 'paused') break;

            const { partNumber, url } = remainingPartUrls[i];
            const start = (partNumber - 1) * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);

            const response = await this.fetchWithRetry(url, {
                method: 'PUT',
                body: chunk,
                signal: this.abortController.signal
            });

            const etag = response.headers.get('ETag');
            parts.push({ PartNumber: partNumber, ETag: etag });

            // Update storage with new completed parts
            const pending = UploadManager.hasPendingUpload();
            if (pending) {
                const allParts = [...(pending.completedParts || []), ...parts];
                this.updateCompletedParts(allParts);
            }

            this.onProgress?.({
                uploadedChunks: completedCount + i + 1,
                totalChunks: totalParts
            });
        }

        return parts;
    }

    // Helper for retries
    async fetchWithRetry(url, options, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response;
            } catch (err) {
                if (i === retries - 1 || options.signal?.aborted) throw err;
                // Exponential backoff: 1s, 2s, 4s
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
            }
        }
    }

    cancel() {
        this.state = 'cancelled';
        this.abortController?.abort();
        this.currentXhr?.abort();
        // Don't clear pending upload on cancel - user might want to resume
    }

    pause() {
        this.state = 'paused';
        this.abortController?.abort();
        this.currentXhr?.abort();
    }

    resume() {
        // Resume is now handled by resumeUpload method
    }
}
