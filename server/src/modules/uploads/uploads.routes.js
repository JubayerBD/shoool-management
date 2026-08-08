import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { saveFile, uploadsDir } from '../../utils/storage.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Keep the file in memory so the storage driver decides where it lands.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'Only image files are allowed (jpeg, png, webp, gif)'));
  },
});

const router = Router();

// Upload a single image; returns its public URL (local disk or S3 per STORAGE_DRIVER).
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'teacher', 'accountant'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No file uploaded (field name must be "file")');
    const saved = await saveFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.status(201).json({ url: saved.url, filename: saved.filename });
  }
);

export { router as uploadsRouter, uploadsDir };
