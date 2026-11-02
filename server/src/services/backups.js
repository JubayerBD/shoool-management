import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readdir, readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const backupDirectory = () => path.resolve(process.env.BACKUP_DIR || path.join(root, '.data', 'backups'));
const defaultUploads = path.join(root, 'server', 'uploads');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let running = null;

export async function listBackups(directory = backupDirectory()) {
  await mkdir(directory, { recursive: true });
  const out = [];
  for (const name of await readdir(directory)) {
    if (!/^backup-[\dTZ-]+-[a-f\d-]{36}$/.test(name)) continue;
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, name, 'manifest.json'), 'utf8'));
      if (manifest.format === 1 && manifest.id === name) out.push(manifest);
    } catch { /* Incomplete backups are never advertised as successful. */ }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createBackup(connection = mongoose.connection, options = {}) {
  if (running) return running;
  running = writeBackup(connection, options).finally(() => { running = null; });
  return running;
}
async function writeBackup(connection, { directory = backupDirectory(), uploads = defaultUploads, kind = 'manual' } = {}) {
  const createdAt = new Date().toISOString(), id = `backup-${createdAt.replace(/[.:]/g, '-')}-${randomUUID()}`;
  const staging = path.join(directory, `${id}.partial`), destination = path.join(directory, id);
  await mkdir(path.join(staging, 'uploads'), { recursive: true });
  const collections = [];
  const names = await connection.db.listCollections({}, { nameOnly: false }).toArray();
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      collections.length = 0;
      for (const info of names.filter((c) => c.type === 'collection' && !c.name.startsWith('system.')).sort((a, b) => a.name.localeCompare(b.name))) {
        const collection = connection.db.collection(info.name);
        collections.push({ name: info.name, documents: await collection.find({}, { session, promoteValues: false, promoteLongs: false }).toArray() });
      }
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
  } finally { await session.endSession(); }
  for (const c of collections) c.indexes = await connection.db.collection(c.name).indexes();
  const bytes = gzipSync(mongoose.mongo.BSON.EJSON.stringify({ format: 1, database: connection.name, createdAt, collections }, { relaxed: false }));
  await writeFile(path.join(staging, 'database.ejson.gz'), bytes, { flag: 'wx' });
  const files = [];
  await mkdir(uploads, { recursive: true });
  for (const entry of await readdir(uploads, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Backups require ordinary upload files, not symbolic links');
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    const source = path.join(uploads, entry.name), target = path.join(staging, 'uploads', entry.name);
    await copyFile(source, target);
    const file = await readFile(target);
    files.push({ name: entry.name, bytes: file.length, sha256: hash(file) });
  }
  const manifest = { format: 1, id, createdAt, kind, database: connection.name, databaseSha256: hash(bytes), databaseBytes: bytes.length,
    collections: collections.map((c) => ({ name: c.name, count: c.documents.length })), uploads: files };
  await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  await mkdir(directory, { recursive: true });
  await rename(staging, destination); // Only completed backups become visible.
  return manifest;
}

export async function restoreBackup(connection, source, { uploads = defaultUploads } = {}) {
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1) throw new Error('Unsupported backup format');
  const compressed = await readFile(path.join(source, 'database.ejson.gz'));
  if (hash(compressed) !== manifest.databaseSha256) throw new Error('Backup checksum does not match');
  const payload = mongoose.mongo.BSON.EJSON.parse(gunzipSync(compressed).toString('utf8'), { relaxed: false });
  if (Number(payload.format) !== 1 || payload.collections.length !== manifest.collections.length) throw new Error('Invalid backup contents');
  // Validate every upload before writing any data.
  for (const file of manifest.uploads) {
    if (path.basename(file.name) !== file.name || file.name.includes('..')) throw new Error('Invalid upload filename');
    if (hash(await readFile(path.join(source, 'uploads', file.name))) !== file.sha256) throw new Error(`Upload checksum failed: ${file.name}`);
  }
  const existing = await connection.db.listCollections().toArray();
  for (const c of existing) if (!c.name.startsWith('system.') && await connection.db.collection(c.name).countDocuments()) throw new Error('Restore target must be an empty database. Existing records are never overwritten.');
  for (const c of payload.collections) {
    const expected = manifest.collections.find((x) => x.name === c.name);
    if (!expected || c.documents.length !== expected.count) throw new Error('Collection count does not match manifest');
    if (!existing.some((x) => x.name === c.name)) await connection.db.createCollection(c.name);
    const collection = connection.db.collection(c.name);
    if (c.documents.length) await collection.insertMany(c.documents, { ordered: true });
    for (const index of c.indexes) {
      if (index.name === '_id_') continue;
      const { key, v, ns, background, ...options } = index;
      await collection.createIndex(key, options);
    }
    if (await collection.countDocuments() !== expected.count) throw new Error(`Restore verification failed for ${c.name}`);
  }
  await mkdir(uploads, { recursive: true });
  for (const file of manifest.uploads) {
    const target = path.join(uploads, file.name);
    try {
      await stat(target);
      if (hash(await readFile(target)) !== file.sha256) throw new Error('Restore would overwrite a different upload file');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await copyFile(path.join(source, 'uploads', file.name), target);
    }
  }
  return { collections: manifest.collections.length, documents: manifest.collections.reduce((n, c) => n + c.count, 0), uploads: manifest.uploads.length };
}

export function startAutomaticBackups() {
  if (process.env.BACKUPS_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
  if (!Number.isFinite(hours) || hours < 1) throw new Error('BACKUP_INTERVAL_HOURS must be at least 1');
  const tick = async () => {
    try {
      const saved = await backupIfDue(mongoose.connection, { hours });
      if (saved) console.log(`[backups] Saved ${saved.id}`);
    } catch (err) { console.error('[backups] Automatic backup failed:', err.message); }
  };
  void tick();
  const timer = setInterval(tick, 60000); timer.unref();
  return () => clearInterval(timer);
}

export async function backupIfDue(connection, { hours = 24, now = Date.now(), ...options } = {}) {
  const latest = (await listBackups(options.directory))[0];
  if (latest && now - +new Date(latest.createdAt) < hours * 3600000) return null;
  return createBackup(connection, { ...options, kind: 'automatic' });
}
