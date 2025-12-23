import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend root (one level up from src/)
const envPath = join(__dirname, '..', '.env');
console.log('🔍 Looking for .env at:', envPath);
console.log('📁 File exists?', existsSync(envPath));

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Error loading .env:', result.error);
} else {
  console.log('✅ .env loaded successfully');
  console.log('📝 Loaded variables:', Object.keys(result.parsed || {}));
}

import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload.js';
import fileRoutes from './routes/file.js';
import analyticsRoutes from './routes/analytics.js';
import replaceRoutes from './routes/replace.js';
import connectDB from './db/connect.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowed = ['http://localhost:3000', process.env.CLIENT_URL];

    if (origin.endsWith('.vercel.app') || allowed.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'QuickDrop API running' });
});

app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/replace', replaceRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`☁️  Direct S3 uploads enabled`);
});
