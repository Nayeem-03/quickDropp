// Web Crypto API utilities for Client-Side Encryption

// Generate a random AES-GCM key
export async function generateKey() {
    return window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

// Export key to base64 string (for URL hash)
export async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return bufferToBase64(exported);
}

// Import key from base64 string
export async function importKey(base64Key) {
    const buffer = base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey(
        "raw",
        buffer,
        {   // this is the algorithm options
            name: "AES-GCM",
        },
        true, // whether the key is extractable (i.e. can be used in exportKey)
        ["encrypt", "decrypt"] // can be used to encrypt and decrypt
    );
}

// Encrypt a chunk of data
// Returns { iv, data }
export async function encryptChunk(chunk, key) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV for AES-GCM
    const encrypted = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        chunk
    );
    
    // We confirm to return a single buffer: IV + Ciphertext
    // This makes it easier to store as a blob
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return result;
}

// Decrypt a chunk of data
// Expects buffer to contain IV (first 12 bytes) + Ciphertext
export async function decryptChunk(buffer, key) {
    const iv = buffer.slice(0, 12);
    const data = buffer.slice(12);
    
    return window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        data
    );
}

// Helpers
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
