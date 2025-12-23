import express from 'express';
import { initUpload, completeUpload } from '../controllers/uploadController.js';

const router = express.Router();

router.post('/init', initUpload);
router.post('/complete', completeUpload);

export default router;
