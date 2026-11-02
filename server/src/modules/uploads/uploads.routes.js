import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { saveFile, uploadsDir } from '../../utils/storage.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// The stored extension comes from the verified image type, never from the client's file name.
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

/** True when the file's leading bytes really are the image type it claims to be. */
function looksLike(buffer, mimetype) {
  const startsWith = (...bytes) => bytes.every((byte, i) => buffer[i] === byte);
  if (mimetype === 'image/jpeg') return buffer.length >= 4 && startsWith(0xff, 0xd8, 0xff) && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9;
  if (mimetype === 'image/png') {
    if (buffer.length < 45 || !startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return false;
    let offset = 8, imageData = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > buffer.length) return false;
      if (offset === 8 && (type !== 'IHDR' || length !== 13 || !buffer.readUInt32BE(16) || !buffer.readUInt32BE(20))) return false;
      if (type === 'IDAT') imageData = true;
      offset += length + 12;
      if (type === 'IEND') return length === 0 && offset === buffer.length && imageData;
    }
    return false;
  }
  if (mimetype === 'image/gif') return buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString()) && buffer.at(-1) === 0x3b;
  if (mimetype === 'image/webp') return buffer.length >= 20 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' && buffer.readUInt32LE(4) + 8 === buffer.length;
  return false;
}

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
    if (!looksLike(req.file.buffer, req.file.mimetype)) throw ApiError.badRequest('The file is not a valid image');
    const saved = await saveFile(req.file.buffer, `upload${EXTENSIONS[req.file.mimetype]}`, req.file.mimetype);
    res.status(201).json({ url: saved.url, filename: saved.filename });
  }
);

export { router as uploadsRouter, uploadsDir };
