import express from 'express';
import { initUpload, completeUpload, refreshPartUrls } from '../controllers/uploadController.js';

const router = express.Router();

router.post('/init', initUpload);
router.post('/complete', completeUpload);
router.post('/refresh-urls', refreshPartUrls);

export default router;
