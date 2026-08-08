import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  try {
    await connectDB();
    const app = createApp();
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] API running on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
