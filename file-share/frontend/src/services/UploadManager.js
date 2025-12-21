import { API_URL } from '../config.js';

// Upload Manager - Handles parallel chunked uploads with S3 backend
export class UploadManager {
    constructor() {
        this.state = 'idle';
        this.abortControllers = new Map();
        this.uploadedChunks = new Set();
        this.fileId = null;
        this.pauseResolver = null;
    }

    reset() {
        this.state = 'idle';
        this.abortControllers.clear();
        this.uploadedChunks.clear();
        this.fileId = null;
        this.pauseResolver = null;
    }

    async uploadFile(file, options = {}) {
        this.reset();

        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        // Initialize upload
        const initResponse = await fetch(`${API_URL}/api/upload/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                chunkCount: totalChunks,
                expiryMs: options.expiryMs || 0,
                selfDestruct: options.selfDestruct || false,
                password: options.password || null
            })
        });

        const { fileId } = await initResponse.json();
        this.fileId = fileId;
        this.state = 'uploading';

        // Upload chunks in parallel
        const PARALLEL_UPLOADS = 3;
        for (let i = 0; i < totalChunks; i += PARALLEL_UPLOADS) {
            const batch = [];

            for (let j = 0; j < PARALLEL_UPLOADS && i + j < totalChunks; j++) {
                const chunkIndex = i + j;

                if (this.state === 'paused') await this.waitForResume();
                if (this.state === 'cancelled') return { success: false, cancelled: true };
                if (this.uploadedChunks.has(chunkIndex)) continue;

                batch.push(this.uploadChunk(file, fileId, chunkIndex, CHUNK_SIZE));
            }

            try {
                await Promise.all(batch);
            } catch (error) {
                if (this.state === 'cancelled' || error.name === 'AbortError') {
                    return { success: false, cancelled: true };
                }
                throw error;
            }
        }

        // Complete upload
        const completeResponse = await fetch(`${API_URL}/api/upload/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId })
        });

        const { shareLink, fileName } = await completeResponse.json();
        this.state = 'completed';

        return { success: true, fileId, shareLink, fileName };
    }

    async uploadChunk(file, fileId, chunkIndex, chunkSize) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('fileId', fileId);
        formData.append('chunkIndex', chunkIndex);
        formData.append('chunk', chunk);

        const controller = new AbortController();
        this.abortControllers.set(chunkIndex, controller);

        const MAX_RETRIES = 3;
        let attempt = 0;

        try {
            while (attempt < MAX_RETRIES) {
                try {
                    const response = await fetch(`${API_URL}/api/upload/chunk`, {
                        method: 'POST',
                        body: formData,
                        signal: controller.signal
                    });

                    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

                    this.uploadedChunks.add(chunkIndex);
                    this.onProgress?.({
                        chunkIndex,
                        totalChunks: Math.ceil(file.size / chunkSize),
                        uploadedChunks: this.uploadedChunks.size
                    });
                    break;

                } catch (error) {
                    if (error.name === 'AbortError') throw error;
                    attempt++;
                    if (attempt === MAX_RETRIES) throw error;
                    await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                }
            }
        } finally {
            this.abortControllers.delete(chunkIndex);
        }
    }

    pause() {
        if (this.state === 'uploading') this.state = 'paused';
    }

    resume() {
        if (this.state === 'paused') {
            this.state = 'uploading';
            this.pauseResolver?.();
        }
    }

    cancel() {
        this.state = 'cancelled';
        for (const controller of this.abortControllers.values()) {
            controller.abort();
        }
        this.abortControllers.clear();
    }

    waitForResume() {
        return new Promise(resolve => { this.pauseResolver = resolve; });
    }
}
