import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'metadata.json');

// Initialize DB if not exists
async function initDB() {
    try {
        await fs.access(DB_PATH);
    } catch {
        await fs.writeFile(DB_PATH, JSON.stringify({}));
    }
}

// Simple in-memory mutex to serialize writes
let writeQueue = Promise.resolve();

export async function saveFileMetadata(fileId, metadata) {
    // Chain this operation to the end of the queue
    const operation = async () => {
        let retries = 3;
        while (retries > 0) {
            try {
                await initDB();
                const content = await fs.readFile(DB_PATH, 'utf8');
                const data = content ? JSON.parse(content) : {};

                data[fileId] = metadata;

                // Direct write (Windows-friendly, no rename needed)
                await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
                return;
            } catch (err) {
                retries--;
                if (retries === 0) {
                    console.error('Storage save error after retries:', err.message);
                    // Don't throw - allow upload to continue even if metadata save fails
                    return;
                }
                // Wait before retry
                await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
            }
        }
    };

    // Add to queue and wait
    const result = writeQueue.then(operation);

    // Ensure queue continues even if this operation fails
    writeQueue = result.catch(() => { });

    return result;
}

export async function getFileMetadata(fileId) {
    // Wait for pending writes to ensure we get latest data
    return writeQueue.then(async () => {
        await initDB();
        try {
            const content = await fs.readFile(DB_PATH, 'utf8');
            const data = content ? JSON.parse(content) : {};
            return data[fileId];
        } catch (err) {
            console.error('[Storage] Read error:', err.message);
            return null;
        }
    });
}
