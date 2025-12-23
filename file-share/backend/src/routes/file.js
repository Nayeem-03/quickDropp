import express from 'express';
import { getFileInfo, previewFile, verifyPassword, downloadFile } from '../controllers/fileController.js';

const router = express.Router();

router.get('/:fileId', getFileInfo);
router.post('/preview/:fileId', previewFile);
router.post('/verify/:fileId', verifyPassword);
router.post('/download/:fileId', downloadFile);

export default router;
