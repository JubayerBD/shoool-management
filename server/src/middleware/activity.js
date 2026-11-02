import { ActivityLog } from '../models/ActivityLog.js';

const mutations = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const trackedModules = new Set(['auth', 'academics', 'people', 'attendance', 'exams', 'fees', 'schedule', 'dashboard', 'users', 'finance', 'partners', 'uploads', 'activity-logs', 'backups', 'calendar']);
const safeFields = new Set(['name', 'amount', 'amountCents', 'totalAmount', 'net', 'reference', 'invoiceNo', 'receiptNo', 'status', 'isActive', 'role', 'date', 'paidAt', 'from', 'to', 'decision']);
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : '';
const objectId = (value) => /^[a-f\d]{24}$/i.test(String(value || '')) ? String(value) : '';
const publicName = (value) => typeof value === 'string' ? { en: text(value), bn: '' } : { en: text(value?.en), bn: text(value?.bn) };
function safeDetails(source) {
  const result = {};
  for (const key of safeFields) {
    const value = source?.[key];
    if (key === 'name' && value) result.name = publicName(value);
    else if (typeof value === 'string') result[key] = value.slice(0, 200);
    else if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') result[key] = value;
  }
  return result;
}
function actionFor(req, path) {
  if (path === '/api/auth/login') return 'login';
  if (path === '/api/auth/logout') return 'logout';
  if (/\/password$/.test(path)) return 'password-reset';
  if (/\/(preview|status|review|activate|pause|generate|import)$/.test(path)) return path.split('/').at(-1);
  return { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete', GET: 'access' }[req.method] || 'request';
}

// Log user actions, rather than every successful read. Persist before returning
// JSON so the next log-list request can see the completed event. Only explicit
// safe metadata is copied: never request/response bodies, tokens, or passwords.
export function activityLogging(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/health') || req.path.startsWith('/api/files/')) return next();
  const json = res.json;
  let sending = false;
  res.json = function (body) {
    const path = req.originalUrl.split('?')[0];
    const parts = path.split('/').filter(Boolean).slice(1);
    if (sending || (!mutations.has(req.method) && res.statusCode < 400) || !trackedModules.has(parts[0])) return json.call(this, body);
    sending = true;
    const resource = req.route ? parts.filter((part) => !objectId(part)).slice(0, 4).join('/') : parts[0];
    const user = req.user;
    const record = body?.item || body?.invoice || body?.user;
    const id = objectId(record?.id || record?._id || body?.id || req.params.id || [...parts].reverse().find((part) => objectId(part)));
    const route = `${req.baseUrl || ''}${typeof req.route?.path === 'string' ? req.route.path : '/*'}`;
    const attempted = path === '/api/auth/login' && typeof req.body?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email) ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    const entry = {
      ...(user?._id ? { actor: user._id } : {}), actorName: publicName(user?.name), actorEmail: text(user?.email, 254), actorRole: text(user?.role, 30),
      attemptedEmail: user ? '' : attempted,
      action: actionFor(req, path), module: text(parts[0], 40) || 'system', resource: text(resource, 120), recordId: id,
      method: req.method, route: text(route, 240), status: res.statusCode, outcome: res.statusCode < 400 ? 'success' : 'failed',
      changedFields: mutations.has(req.method) && !path.startsWith('/api/auth/') ? Object.keys(req.body || {}).filter((key) => safeFields.has(key)) : [],
      details: res.statusCode < 400 && !path.startsWith('/api/auth/') ? safeDetails(record || req.body) : {},
    };
    ActivityLog.create(entry).then(() => {
      if (!res.headersSent) json.call(res, body);
    }).catch((error) => {
      // The business operation may already be committed. Preserve its response
      // instead of falsely reporting that it failed, and surface the audit fault.
      console.error('[activity-log] Could not persist activity:', error.message);
      if (!res.headersSent) { res.setHeader('X-Activity-Log', 'unavailable'); json.call(res, body); }
    });
    return this;
  };
  next();
}
