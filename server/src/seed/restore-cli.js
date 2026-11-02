import mongoose from 'mongoose';
import { restoreBackup } from '../services/backups.js';
const [source, targetUri, uploads] = process.argv.slice(2);
if (!source || !targetUri) throw new Error('Usage: node src/seed/restore-cli.js <backup-folder> <empty-target-mongodb-uri> [uploads-folder]');
try {
  await mongoose.connect(targetUri);
  console.log(JSON.stringify(await restoreBackup(mongoose.connection, source, uploads ? { uploads } : {})));
} finally { await mongoose.disconnect(); }
