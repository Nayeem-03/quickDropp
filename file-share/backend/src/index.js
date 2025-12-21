import dotenv from 'dotenv';
dotenv.config(); // Must be FIRST before any other imports that use env vars

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import uploadRoutes from './routes/upload.js';
import fileRoutes from './routes/file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', process.env.CLIENT_URL || 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Create temp directory for chunk uploads
const tempDir = path.join(__dirname, '..', 'temp');
await fs.mkdir(tempDir, { recursive: true });

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'QuickDrop API running' });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`☁️  Using AWS S3 for file storage`);
});
