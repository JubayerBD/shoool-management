import { ApiError } from '../utils/ApiError.js';

const FORBIDDEN_KEYS = ['__proto__', 'prototype', 'constructor'];

// API forms submit data, never MongoDB operators or prototype mutation keys.
// The query string is checked too: `?section[$ne]=x` would otherwise reach a database filter as an operator.
export function rejectUnsafePayload(req, _res, next) {
  const pending = [[req.body, true], [req.query, false]];
  let visited = 0;
  while (pending.length) {
    const [value, isBody] = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if ((visited += 1) > 5000) throw ApiError.badRequest('Request is too complex');
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$') || (isBody && key.includes('.')) || FORBIDDEN_KEYS.includes(key)) throw ApiError.badRequest('Unsupported field in request');
      if (child && typeof child === 'object') pending.push([child, isBody]);
    }
  }
  next();
}

// The app only loads its own scripts; styles and fonts also come from Google Fonts.
// Images may be uploaded photos (same origin or an S3 bucket), data: previews or blob: downloads.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/** Baseline browser protections for every response. */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  // Personal and financial records must not linger in browser or proxy caches (uploaded images may).
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/files/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

const WINDOW_MS = 15 * 60 * 1000;

/**
 * The visitor's address for rate limiting. Render fronts the app with Cloudflare, so behind it
 * `req.ip` can be a shared edge address; Cloudflare's own header names the real visitor and is
 * overwritten at the edge, so a client cannot forge it there. Elsewhere, trust only `req.ip`.
 */
function clientAddress(req) {
  const edge = process.env.RENDER ? req.headers['cf-connecting-ip'] : null;
  return (typeof edge === 'string' && edge.length <= 64 && edge) || req.ip;
}

/** Fixed-window counters kept in memory: one set per server instance. */
function counterStore() {
  const entries = new Map();
  const live = (key) => {
    const entry = entries.get(key);
    return entry && entry.resetAt > Date.now() ? entry : null;
  };
  return {
    get: live,
    hit(key, windowMs = WINDOW_MS) {
      const entry = live(key);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, resetAt: Date.now() + windowMs });
      if (entries.size > 5000) for (const [k, v] of entries) if (v.resetAt <= Date.now()) entries.delete(k);
      return entries.get(key);
    },
    clear: (key) => entries.delete(key),
  };
}

const tooMany = (res, entry, message) => {
  res.setHeader('Retry-After', Math.ceil((entry.resetAt - Date.now()) / 1000));
  return new ApiError(429, message);
};

const MAX_FAILURES = 10; // per account from one address
const MAX_FAILURES_PER_IP = 40; // across all accounts from one address (password spraying)
const loginFailures = counterStore();

/**
 * Slow down password guessing: after 10 failed logins for the same account from the
 * same address — or 40 failed logins from one address across any accounts — further
 * attempts get 429 until the 15 minute window passes. A successful login resets the
 * per-account counter. (In-memory: one counter per server instance.)
 */
export function loginLimiter(req, res, next) {
  const address = clientAddress(req);
  const ipKey = `ip|${address}`;
  const key = `${address}|${String(req.body?.email || '').toLowerCase()}`;
  for (const [entry, max] of [[loginFailures.get(key), MAX_FAILURES], [loginFailures.get(ipKey), MAX_FAILURES_PER_IP]]) {
    if (entry && entry.count >= max) throw tooMany(res, entry, 'Too many failed login attempts. Please try again in 15 minutes.');
  }
  res.on('finish', () => {
    if (res.statusCode === 401) { loginFailures.hit(key); loginFailures.hit(ipKey); }
    else if (res.statusCode === 200) loginFailures.clear(key);
  });
  next();
}

const passwordFailures = counterStore();

/** Limit wrong "current password" guesses on the change-password form (5 per 15 minutes per account). */
export function passwordChangeLimiter(req, res, next) {
  const key = String(req.user?.id || clientAddress(req));
  const entry = passwordFailures.get(key);
  if (entry && entry.count >= 5) throw tooMany(res, entry, 'Too many incorrect attempts. Please try again in 15 minutes.');
  res.on('finish', () => {
    if (res.statusCode === 400 && res.locals.wrongCurrentPassword) passwordFailures.hit(key);
    else if (res.statusCode === 200) passwordFailures.clear(key);
  });
  next();
}

const API_WINDOW_MS = 60 * 1000;
const API_MAX_PER_WINDOW = Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 1200;
const apiHits = counterStore();

/**
 * Flood protection for the API: a generous per-address ceiling (a whole school office may
 * share one address) that still stops scripted scraping and runaway loops.
 */
export function apiLimiter(req, res, next) {
  if (!req.path.startsWith('/api/') || req.path === '/api/health' || req.path.startsWith('/api/files/')) return next();
  const entry = apiHits.hit(clientAddress(req), API_WINDOW_MS);
  if (entry.count > API_MAX_PER_WINDOW) throw tooMany(res, entry, 'Too many requests. Please slow down and try again shortly.');
  next();
}
