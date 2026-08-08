import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

/** Require a valid Bearer token; attaches req.user (lean User doc). */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing authentication token');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');

  req.user = user;
  next();
}

/**
 * Restrict a route to one or more roles.
 * Usage: router.post('/', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!allowed.includes(req.user.role)) {
      throw ApiError.forbidden('You do not have permission to perform this action');
    }
    next();
  };
}
