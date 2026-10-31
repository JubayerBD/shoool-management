/*
 * Dev-only helper: starts an in-memory MongoDB on a fixed port so the app can
 * run without a real MongoDB install. NOT for production — data is wiped on exit.
 *
 * Usage: node src/seed/memory-mongo.js   (keeps running until Ctrl-C)
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.MEMORY_MONGO_PORT) || 27017;

const mongod = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: PORT }],
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

// eslint-disable-next-line no-console
console.log(`[memory-mongo] Running at ${mongod.getUri()}`);
// eslint-disable-next-line no-console
console.log('[memory-mongo] Leave this running; open another terminal for seed/dev.');

const shutdown = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
