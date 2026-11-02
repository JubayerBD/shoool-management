import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { createBackup, backupDirectory } from '../services/backups.js';
try {
  await connectDB();
  const manifest = await createBackup(mongoose.connection, { kind: process.env.BACKUP_KIND || 'manual' });
  console.log(JSON.stringify({ directory: backupDirectory(), ...manifest }, null, 2));
} finally { await mongoose.disconnect(); }
