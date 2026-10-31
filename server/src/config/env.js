import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve configuration from the server directory, regardless of launch folder.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.warn(`[env] Warning: ${key} is not set. Check your .env file.`);
  }
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.error('[env] SECURITY: JWT_SECRET is not set in production. Anyone can forge login tokens. Set a long random JWT_SECRET now.');
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_management',
  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // When true, the API also serves the built client (single-service deploy).
  serveClient: process.env.SERVE_CLIENT === 'true',
  clientDist: process.env.CLIENT_DIST || '',
};
