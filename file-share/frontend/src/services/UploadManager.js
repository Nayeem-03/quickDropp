import { API_URL } from '../config.js';

// Upload Manager - Direct to S3 with presigned URLs
export class UploadManager {
    constructor() {
        this.state = 'idle';
        this.abortController = null;
        this.fileId = null;
    }

    reset() {
        this.state = 'idle';
        this.abortController = null;
        this.fileId = null;
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
            const uploadId = initData.uploadId; // Capture uploadId
            this.state = 'uploading';

            let parts = [];

            if (initData.multipart) {
                // Multipart upload for large files
                parts = await this.uploadMultipart(file, initData.partUrls, initData.chunkSize);
            } else {
                // Single upload for small files
                await this.uploadSingle(file, initData.uploadUrl);
            }

            if (this.state === 'cancelled') {
                return { success: false, cancelled: true };
            }

            // 3. Complete upload
            const completeResponse = await fetch(`${API_URL}/api/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: this.fileId,
                    uploadId: uploadId, // Send uploadId back
                    parts: parts.length > 0 ? parts : undefined
                }),
                signal: this.abortController.signal
            });

            if (!completeResponse.ok) throw new Error('Failed to complete upload');

            const { shareLink, fileName } = await completeResponse.json();
            this.state = 'completed';

            return { success: true, fileId: this.fileId, shareLink, fileName };

        } catch (error) {
            if (error.name === 'AbortError' || this.state === 'cancelled') {
                return { success: false, cancelled: true };
            }
            console.error('Upload error:', error);
            throw error;
        }
    }

    async uploadSingle(file, uploadUrl) {
        await this.fetchWithRetry(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type || 'application/octet-stream'
            },
            signal: this.abortController.signal
        });

        this.onProgress?.({ uploadedChunks: 1, totalChunks: 1 });
    }

    async uploadMultipart(file, partUrls, chunkSize) {
        const parts = [];
        const totalParts = partUrls.length;

        for (let i = 0; i < partUrls.length; i++) {
            if (this.state === 'cancelled') break;

            const { partNumber, url } = partUrls[i];
            const start = i * chunkSize;
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

            this.onProgress?.({ uploadedChunks: i + 1, totalChunks: totalParts });
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
    }

    // Pause/Resume not fully supported yet (requires persistence)
    pause() { this.cancel(); }
    resume() { console.warn('To resume, retry the upload. It will restart.'); }
}
