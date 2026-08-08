import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'express-async-errors';

import { env } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

import authRoutes from './modules/auth/auth.routes.js';
import academicsRoutes from './modules/academics/academics.routes.js';
import peopleRoutes from './modules/people/people.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import examsRoutes from './modules/exams/exams.routes.js';
import feesRoutes from './modules/fees/fees.routes.js';
import scheduleRoutes from './modules/schedule/schedule.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import { uploadsRouter, uploadsDir } from './modules/uploads/uploads.routes.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser tools (no origin) and any whitelisted origin.
        if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api/academics', academicsRoutes);
  app.use('/api/people', peopleRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/exams', examsRoutes);
  app.use('/api/fees', feesRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/uploads', uploadsRouter);
  // Serve uploaded images (long-cached, immutable filenames).
  app.use('/api/files', express.static(uploadsDir, { maxAge: '30d', immutable: true }));

  // Optionally serve the built client (single-service production deploy).
  if (env.serveClient) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = env.clientDist
      ? path.resolve(env.clientDist)
      : path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    // SPA fallback for non-API routes.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
