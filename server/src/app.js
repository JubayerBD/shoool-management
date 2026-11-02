import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import 'express-async-errors';

import { env } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { securityHeaders, rejectUnsafePayload } from './middleware/security.js';
import { activityLogging } from './middleware/activity.js';

import authRoutes from './modules/auth/auth.routes.js';
import academicsRoutes from './modules/academics/academics.routes.js';
import peopleRoutes from './modules/people/people.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import examsRoutes from './modules/exams/exams.routes.js';
import feesRoutes from './modules/fees/fees.routes.js';
import scheduleRoutes from './modules/schedule/schedule.routes.js';
import calendarRoutes from './modules/schedule/calendar.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';
import partnersRoutes from './modules/partners/partners.routes.js';
import profitRoutes from './modules/finance/profit.routes.js';
import balanceRoutes from './modules/finance/balance.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';
import backupsRoutes from './modules/backups/backups.routes.js';
import correctionsRoutes from './modules/finance/corrections.routes.js';
import { uploadsRouter, uploadsDir } from './modules/uploads/uploads.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy: real client IP + req.secure
  app.use(securityHeaders);

  // CORS: allow non-browser tools, whitelisted origins, and — importantly —
  // the app's own origin (same-origin requests when the API also serves the
  // client). Same-origin is detected by comparing the Origin host to the
  // request Host, so it works on Render and any custom domain automatically.
  app.use((req, res, next) => {
    const corsMw = cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl, server-to-server
        if (env.clientOrigins.includes(origin)) return cb(null, true);
        try {
          if (new URL(origin).host === req.headers.host) return cb(null, true);
        } catch {
          /* malformed origin */
        }
        return cb(null, false); // deny without throwing a 500
      },
      credentials: true,
    });
    return corsMw(req, res, next);
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(activityLogging);
  app.use(rejectUnsafePayload);
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString(), release: process.env.RENDER_GIT_COMMIT || null }));

  app.use('/api/auth', authRoutes);
  app.use('/api/academics', academicsRoutes);
  app.use('/api/people', peopleRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/exams', examsRoutes);
  app.use('/api/fees', feesRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/activity-logs', activityRoutes);
  app.use('/api/backups', backupsRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/finance', correctionsRoutes);
  app.use('/api/finance/profit', profitRoutes);
  app.use('/api/finance/balance', balanceRoutes);
  app.use('/api/partners', partnersRoutes);
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
