import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
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
  origin: [
    'http://localhost:3000',
    process.env.CLIENT_URL || 'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
await fs.mkdir(uploadsDir, { recursive: true });

// MongoDB (optional)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('⚠️  MongoDB not connected:', err.message));
} else {
  console.log('⚠️  MongoDB not configured - using file-based storage');
}

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'FastShare API running' });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Files stored in: ${uploadsDir}`);
});
