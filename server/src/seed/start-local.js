// Starts the persistent database and API together. Run the client separately in dev.
process.env.MONGO_URI = `mongodb://127.0.0.1:${process.env.LOCAL_MONGO_PORT || 27018}/school_management?replicaSet=school-local`;
process.env.DATABASE_PERSISTENT = 'true';
await import('./local-mongo.js');
await import('../server.js');
