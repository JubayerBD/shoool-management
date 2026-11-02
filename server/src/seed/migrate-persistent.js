import mongoose from 'mongoose';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createBackup, restoreBackup, backupDirectory } from '../services/backups.js';

const [sourceUri, targetUri] = process.argv.slice(2);
if (!sourceUri || !targetUri || sourceUri === targetUri || process.env.MIGRATION_MAINTENANCE !== 'true') throw new Error('Stop the API, set MIGRATION_MAINTENANCE=true, then supply distinct source and empty target MongoDB URIs');
const connections = [];
const sorted = (v) => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
const fingerprint = (docs) => createHash('sha256').update(JSON.stringify(sorted(mongoose.mongo.BSON.EJSON.serialize(docs, { relaxed: false })))).digest('hex');
try {
  const source = await mongoose.createConnection(sourceUri).asPromise(); connections.push(source);
  const target = await mongoose.createConnection(targetUri).asPromise(); connections.push(target);
  if (source.host === target.host && source.port === target.port && source.name === target.name) throw new Error('Source and target must be different databases');
  for (const c of await target.db.listCollections().toArray()) if (await target.db.collection(c.name).countDocuments()) throw new Error('Migration target is not empty');
  const manifest = await createBackup(source, { kind: 'migration-before' });
  const backup = path.join(backupDirectory(), manifest.id);
  const restored = await restoreBackup(target, backup);
  const checks = [];
  for (const c of manifest.collections) {
    const options = { promoteValues: false, promoteLongs: false };
    const a = await source.db.collection(c.name).find({}, options).sort({ _id: 1 }).toArray();
    const b = await target.db.collection(c.name).find({}, options).sort({ _id: 1 }).toArray();
    const sourceHash = fingerprint(a), targetHash = fingerprint(b);
    if (a.length !== b.length || sourceHash !== targetHash) throw new Error(`Migration verification failed for ${c.name}; keep the API stopped and source database intact`);
    checks.push({ name: c.name, count: a.length, sha256: targetHash });
  }
  const report = { verifiedAt: new Date().toISOString(), backupId: manifest.id, targetDatabase: target.name, ...restored, checks };
  const reportPath = path.join(backupDirectory(), 'migration-verification.json');
  await mkdir(backupDirectory(), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verified: true, backupId: manifest.id, reportPath, ...restored }));
} finally { for (const c of connections) await c.close(); }
