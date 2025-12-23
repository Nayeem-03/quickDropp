import { API_URL } from '../config.js';

const STORAGE_KEY = 'quickdrop_pending_upload';
const CONCURRENT_UPLOADS = 8; // Maximum parallel uploads for speed

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
        // Speed tracking
        this.uploadStartTime = null;
        this.bytesUploaded = 0;
        this.lastSpeedUpdate = null;
        this.lastBytesForSpeed = 0;
    }

    reset() {
        this.state = 'idle';
        this.abortController = null;
        this.fileId = null;
        this.pendingUpload = null;
        this.uploadStartTime = null;
        this.bytesUploaded = 0;
        this.lastSpeedUpdate = null;
        this.lastBytesForSpeed = 0;
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

            // Speed tracking
            let lastLoaded = 0;
            let lastTime = Date.now();
            this.uploadStartTime = Date.now();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);

                    // Calculate speed
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000; // seconds
                    const bytesDiff = event.loaded - lastLoaded;
                    const currentSpeed = timeDiff > 0.5 ? bytesDiff / timeDiff : 0; // Update every 500ms

                    if (timeDiff > 0.5) {
                        lastLoaded = event.loaded;
                        lastTime = now;
                    }

                    this.onProgress?.({
                        uploadedChunks: percentComplete,
                        totalChunks: 100,
                        bytesUploaded: event.loaded,
                        totalBytes: event.total,
                        speed: currentSpeed
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

    // Parallel upload helper with real-time progress tracking
    uploadChunkWithXHR(file, partNumber, url, chunkSize, onChunkProgress) {
        return new Promise((resolve, reject) => {
            const start = (partNumber - 1) * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);
            const chunkActualSize = end - start;

            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onChunkProgress) {
                    onChunkProgress(partNumber, event.loaded, chunkActualSize);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const etag = xhr.getResponseHeader('ETag');
                    resolve({ PartNumber: partNumber, ETag: etag });
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Chunk upload failed'));
            xhr.onabort = () => reject(new Error('Chunk upload aborted'));

            xhr.open('PUT', url);
            xhr.send(chunk);
        });
    }

    async uploadMultipart(file, partUrls, chunkSize) {
        const parts = [];
        const totalParts = partUrls.length;
        let completedCount = 0;

        // Initialize speed tracking
        this.uploadStartTime = Date.now();
        this.bytesUploaded = 0; // Base bytes from completed batches
        this.lastSpeedUpdate = Date.now();
        this.lastBytesForSpeed = 0;

        // Track progress of current batch
        const batchProgress = new Map();

        // Process chunks in batches of CONCURRENT_UPLOADS
        for (let i = 0; i < partUrls.length; i += CONCURRENT_UPLOADS) {
            if (this.state === 'cancelled' || this.state === 'paused') break;

            // Get the next batch of chunks to upload
            const batch = partUrls.slice(i, i + CONCURRENT_UPLOADS);
            batchProgress.clear();

            // Callback to aggregate progress from all chunks in this batch
            const onBatchChunkProgress = (partNumber, loaded) => {
                batchProgress.set(partNumber, loaded);

                // Calculate total uploaded so far (base + current batch sum)
                let currentBatchTotal = 0;
                for (const loadedBytes of batchProgress.values()) {
                    currentBatchTotal += loadedBytes;
                }

                const totalUploaded = this.bytesUploaded + currentBatchTotal;

                // Calculate speed every 500ms
                const now = Date.now();
                const timeDiff = (now - this.lastSpeedUpdate) / 1000;

                if (timeDiff > 0.5) {
                    const bytesDiff = totalUploaded - this.lastBytesForSpeed;
                    const currentSpeed = bytesDiff / timeDiff;

                    this.lastSpeedUpdate = now;
                    this.lastBytesForSpeed = totalUploaded;

                    // Estimate total completed chunks based on bytes
                    const estimatedChunks = completedCount + (currentBatchTotal / chunkSize);

                    this.onProgress?.({
                        uploadedChunks: estimatedChunks,
                        totalChunks: totalParts,
                        bytesUploaded: totalUploaded,
                        totalBytes: file.size,
                        speed: currentSpeed
                    });
                }
            };

            // Upload batch in parallel
            const batchPromises = batch.map(({ partNumber, url }) =>
                this.uploadChunkWithXHR(file, partNumber, url, chunkSize, onBatchChunkProgress)
            );

            try {
                const batchResults = await Promise.all(batchPromises);
                parts.push(...batchResults);
                completedCount += batchResults.length;

                // Update base bytesUploaded with this completed batch
                // We calculate exact size to be accurate
                const batchBytes = batch.reduce((acc, _, idx) => {
                    // Calculate exact size of this chunk (might be smaller for last chunk)
                    const partNum = batch[idx].partNumber;
                    const start = (partNum - 1) * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    return acc + (end - start);
                }, 0);

                this.bytesUploaded += batchBytes;
                this.lastBytesForSpeed = this.bytesUploaded; // Resync for next batch
                this.lastSpeedUpdate = Date.now(); // Reset timer

                // Save progress after each batch
                this.updateCompletedParts(parts);

            } catch (error) {
                if (this.state === 'cancelled' || this.state === 'paused') break;
                throw error;
            }
        }

        return parts;
    }

    // Resume version of multipart upload (starts from offset) - with parallel uploads
    async uploadMultipartResume(file, remainingPartUrls, chunkSize, completedCount, totalParts) {
        const parts = [];
        let newCompletedCount = 0;

        // Initialize speed tracking
        this.uploadStartTime = Date.now();
        this.bytesUploaded = completedCount * chunkSize; // Account for already uploaded
        this.lastSpeedUpdate = Date.now();
        this.lastBytesForSpeed = this.bytesUploaded;

        // Track progress of current batch
        const batchProgress = new Map();

        // Process remaining chunks in batches
        for (let i = 0; i < remainingPartUrls.length; i += CONCURRENT_UPLOADS) {
            if (this.state === 'cancelled' || this.state === 'paused') break;

            const batch = remainingPartUrls.slice(i, i + CONCURRENT_UPLOADS);
            batchProgress.clear();

            // Callback to aggregate progress
            const onBatchChunkProgress = (partNumber, loaded) => {
                batchProgress.set(partNumber, loaded);

                let currentBatchTotal = 0;
                for (const loadedBytes of batchProgress.values()) {
                    currentBatchTotal += loadedBytes;
                }

                const totalUploaded = this.bytesUploaded + currentBatchTotal;

                const now = Date.now();
                const timeDiff = (now - this.lastSpeedUpdate) / 1000;

                if (timeDiff > 0.5) {
                    const bytesDiff = totalUploaded - this.lastBytesForSpeed;
                    const currentSpeed = bytesDiff / timeDiff;

                    this.lastSpeedUpdate = now;
                    this.lastBytesForSpeed = totalUploaded;

                    const estimatedChunks = completedCount + newCompletedCount + (currentBatchTotal / chunkSize);

                    this.onProgress?.({
                        uploadedChunks: estimatedChunks,
                        totalChunks: totalParts,
                        bytesUploaded: totalUploaded,
                        totalBytes: file.size,
                        speed: currentSpeed
                    });
                }
            };

            const batchPromises = batch.map(({ partNumber, url }) =>
                this.uploadChunkWithXHR(file, partNumber, url, chunkSize, onBatchChunkProgress)
            );

            try {
                const batchResults = await Promise.all(batchPromises);
                parts.push(...batchResults);
                newCompletedCount += batchResults.length;

                // Update base bytes with this completed batch
                const batchBytes = batch.reduce((acc, _, idx) => {
                    const partNum = batch[idx].partNumber;
                    const start = (partNum - 1) * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    return acc + (end - start);
                }, 0);

                this.bytesUploaded += batchBytes;
                this.lastBytesForSpeed = this.bytesUploaded;
                this.lastSpeedUpdate = Date.now();

                // Update storage with new completed parts
                const pending = UploadManager.hasPendingUpload();
                if (pending) {
                    const allParts = [...(pending.completedParts || []), ...parts];
                    this.updateCompletedParts(allParts);
                }

            } catch (error) {
                if (this.state === 'cancelled' || this.state === 'paused') break;
                throw error;
            }
        }

        return parts;
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
}
