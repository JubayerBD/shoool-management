import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createBackup, listBackups } from '../../services/backups.js';
const router = Router();
router.use(requireAuth, requireRole('admin'));
router.get('/', async (_req, res) => {
  const backups = await listBackups();
  res.json({ storage: process.env.DATABASE_PERSISTENT === 'true' ? 'persistent' : 'unverified', enabled: process.env.BACKUPS_ENABLED !== 'false', intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 24),
    items: backups.slice(0, 30).map((b) => ({ id: b.id, createdAt: b.createdAt, kind: b.kind, databaseBytes: b.databaseBytes, documents: b.collections.reduce((n, c) => n + c.count, 0), uploads: b.uploads.length })) });
});
router.post('/', async (_req, res) => {
  const backup = await createBackup(mongoose.connection);
  res.status(201).json({ item: { id: backup.id, createdAt: backup.createdAt } });
});
export default router;
