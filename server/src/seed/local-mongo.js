// Persistent local MongoDB replica set. Files are never cleaned up on exit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, access, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';

const port = Number(process.env.LOCAL_MONGO_PORT || 27018);
const directory = path.resolve(process.env.LOCAL_MONGO_DIR || fileURLToPath(new URL('../../../.data/mongodb', import.meta.url)));
await mkdir(directory, { recursive: true });
const probe = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
let reused = false;
try {
  await probe.connect();
  const options = await probe.db('admin').command({ getCmdLineOpts: 1 });
  const hello = await probe.db('admin').command({ hello: 1 });
  if (path.resolve(options.parsed.storage.dbPath).toLowerCase() !== directory.toLowerCase() || hello.setName !== 'school-local') throw new Error('Local MongoDB port is occupied by a different database');
  reused = true;
} catch (err) { if (err.name !== 'MongoServerSelectionError') throw err; }
finally { await probe.close(); }
if (reused) {
  console.log(`[local-mongo] Reusing the persistent database on port ${port}`);
} else {
const binary = path.resolve(directory, '..', 'bin', process.platform === 'win32' ? 'mongod.exe' : 'mongod');
try { await access(binary); } catch {
  const { MongoBinary } = await import('mongodb-memory-server-core');
  const cached = fileURLToPath(new URL('../../node_modules/.cache/mongodb-memory-server', import.meta.url));
  const source = process.env.MONGOD_BINARY || await MongoBinary.getPath({ downloadDir: cached });
  await mkdir(path.dirname(binary), { recursive: true });
  await copyFile(source, binary);
}
const processMongo = spawn(binary, ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'school-local', '--logpath', path.join(directory, 'mongod.log'), '--logappend'], { windowsHide: true, stdio: 'ignore' });
processMongo.once('error', (err) => { console.error('[local-mongo]', err.message); process.exit(1); });
processMongo.once('exit', (code) => process.exit(code || 0));
const { MongoClient } = mongoose.mongo;
let initialized = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.connect();
    try { await client.db('admin').command({ replSetGetStatus: 1 }); }
    catch (err) { if (err.code !== 94) throw err; await client.db('admin').command({ replSetInitiate: { _id: 'school-local', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } }); }
    const hello = await client.db('admin').command({ hello: 1 });
    if (hello.isWritablePrimary) { initialized = true; break; }
  } catch { /* Starting/electing a primary. */ }
  finally { await client.close(); }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!initialized) { processMongo.kill(); throw new Error('Persistent MongoDB did not become ready'); }
console.log(`[local-mongo] Persistent database ready at mongodb://127.0.0.1:${port}/school_management?replicaSet=school-local`);
console.log(`[local-mongo] Data directory: ${directory}`);
const stop = () => processMongo.kill();
process.on('SIGINT', stop); process.on('SIGTERM', stop);

}
