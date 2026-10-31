import { ApiError } from '../utils/ApiError.js';

/** Baseline browser protections for every response. */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map(); // "ip|email" -> { count, resetAt }

/**
 * Slow down password guessing: after 10 failed logins for the same account from the
 * same address, further attempts get 429 until the 15 minute window passes.
 * Successful logins reset the counter. (In-memory: one counter per server instance.)
 */
export function loginLimiter(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  const entry = failures.get(key);
  if (entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILURES) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - Date.now()) / 1000));
    throw new ApiError(429, 'Too many failed login attempts. Please try again in 15 minutes.');
  }
  res.on('finish', () => {
    if (res.statusCode === 401) {
      const current = failures.get(key);
      if (!current || current.resetAt <= Date.now()) failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
      else current.count += 1;
    } else if (res.statusCode === 200) {
      failures.delete(key);
    }
    if (failures.size > 5000) for (const [k, v] of failures) if (v.resetAt <= Date.now()) failures.delete(k);
  });
  next();
}
