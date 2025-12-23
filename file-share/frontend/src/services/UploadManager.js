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

    // Calculate accurate bytes from completed parts
    calculateCompletedBytes(completedParts, chunkSize, fileSize) {
        if (!completedParts || completedParts.length === 0) return 0;
        let total = 0;
        for (const part of completedParts) {
            const partNumber = part.PartNumber;
            const start = (partNumber - 1) * chunkSize;
            const end = Math.min(start + chunkSize, fileSize);
            total += (end - start);
        }
        return total;
    }

    // Fetch fresh presigned URLs for remaining parts
    async refreshPartUrls(fileId, uploadId, partNumbers) {
        const response = await fetch(`${API_URL}/api/upload/refresh-urls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId, uploadId, partNumbers })
        });
        if (!response.ok) {
            throw new Error('Failed to refresh presigned URLs');
        }
        const data = await response.json();
        return data.partUrls;
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

            // Calculate remaining part numbers
            const remainingPartNumbers = pending.partUrls
                .filter(p => !completedPartNumbers.has(p.partNumber))
                .map(p => p.partNumber);

            if (remainingPartNumbers.length === 0) {
                // All parts already uploaded, just complete
            } else {
                // Fetch FRESH presigned URLs for remaining parts
                const freshPartUrls = await this.refreshPartUrls(
                    pending.fileId,
                    pending.uploadId,
                    remainingPartNumbers
                );

                // Calculate accurate bytes already uploaded
                const completedBytes = this.calculateCompletedBytes(parts, pending.chunkSize, file.size);

                const newParts = await this.uploadMultipartResume(
                    file,
                    freshPartUrls,
                    pending.chunkSize,
                    parts.length,
                    pending.totalParts,
                    completedBytes // Pass accurate base bytes
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
    // Returns { success: true, part } or { success: false, isNetworkError: bool }
    uploadChunkWithXHR(file, partNumber, url, chunkSize, onChunkProgress) {
        return new Promise((resolve) => {
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
                    resolve({ success: true, part: { PartNumber: partNumber, ETag: etag } });
                } else {
                    // Server error (not network)
                    resolve({ success: false, isNetworkError: false, partNumber });
                }
            };

            xhr.onerror = () => {
                // Network error - signal for graceful pause
                resolve({ success: false, isNetworkError: true, partNumber });
            };

            xhr.onabort = () => {
                resolve({ success: false, isNetworkError: false, partNumber, aborted: true });
            };

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
        this.bytesUploaded = 0;
        this.lastSpeedUpdate = Date.now();
        this.lastBytesForSpeed = 0;

        // Track progress of current batch
        const batchProgress = new Map();

        // Process chunks in batches of CONCURRENT_UPLOADS
        for (let i = 0; i < partUrls.length; i += CONCURRENT_UPLOADS) {
            if (this.state === 'cancelled' || this.state === 'paused') break;

            const batch = partUrls.slice(i, i + CONCURRENT_UPLOADS);
            batchProgress.clear();

            // Callback to aggregate progress from all chunks in this batch
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

            const batchResults = await Promise.all(batchPromises);

            // Process results - check for network errors
            let hasNetworkError = false;
            for (const result of batchResults) {
                if (result.success) {
                    parts.push(result.part);
                    completedCount++;

                    // Calculate and add bytes for this part
                    const partNum = result.part.PartNumber;
                    const start = (partNum - 1) * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    this.bytesUploaded += (end - start);

                    // Save progress after EACH successful part (granular saving)
                    this.updateCompletedParts(parts);
                } else if (result.isNetworkError) {
                    hasNetworkError = true;
                }
                // Aborted or server errors are ignored for now (will be retried on resume)
            }

            // Sync speed tracking after processing batch
            this.lastBytesForSpeed = this.bytesUploaded;
            this.lastSpeedUpdate = Date.now();

            // If network error occurred, trigger pause and break
            if (hasNetworkError) {
                this.state = 'paused';
                break;
            }

            if (this.state === 'cancelled' || this.state === 'paused') break;
        }

        return parts;
    }

    // Resume version of multipart upload (starts from offset) - with parallel uploads
    // baseBytes: If provided, use this as the accurate starting bytes. Otherwise fall back to estimate.
    async uploadMultipartResume(file, remainingPartUrls, chunkSize, completedCount, totalParts, baseBytes = null) {
        const parts = [];
        let newCompletedCount = 0;

        // CRITICAL: Capture the original completed parts ONCE at the start
        // Do NOT re-read inside the loop as it causes duplicate accumulation
        const originalPending = UploadManager.hasPendingUpload();
        const originalCompletedParts = originalPending?.completedParts || [];

        // Initialize speed tracking with accurate bytes if provided, otherwise estimate
        this.uploadStartTime = Date.now();
        this.bytesUploaded = baseBytes !== null ? baseBytes : (completedCount * chunkSize);
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

            const batchResults = await Promise.all(batchPromises);

            // Process results - check for network errors
            let hasNetworkError = false;

            for (const result of batchResults) {
                if (result.success) {
                    parts.push(result.part);
                    newCompletedCount++;

                    // Calculate and add bytes for this part
                    const partNum = result.part.PartNumber;
                    const start = (partNum - 1) * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    this.bytesUploaded += (end - start);

                    // Save progress: original parts (captured once) + new parts from this session
                    const allParts = [...originalCompletedParts, ...parts];
                    this.updateCompletedParts(allParts);
                } else if (result.isNetworkError) {
                    hasNetworkError = true;
                }
            }

            // Sync speed tracking
            this.lastBytesForSpeed = this.bytesUploaded;
            this.lastSpeedUpdate = Date.now();

            // If network error occurred, trigger pause and break
            if (hasNetworkError) {
                this.state = 'paused';
                break;
            }

            if (this.state === 'cancelled' || this.state === 'paused') break;
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
