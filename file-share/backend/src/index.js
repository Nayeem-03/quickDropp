import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import uploadRoutes from './routes/upload.js';
import fileRoutes from './routes/file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', process.env.CLIENT_URL || 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Create uploads directory
const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
await fs.mkdir(uploadsDir, { recursive: true });

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'QuickDrop API running' });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Files stored in: ${uploadsDir}`);
});
