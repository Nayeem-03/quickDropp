import express from 'express';
import { replaceFile } from '../controllers/replaceController.js';

const router = express.Router();

router.post('/:linkId', replaceFile);

export default router;
