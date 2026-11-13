import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { loginLimiter, passwordChangeLimiter } from '../../middleware/security.js';
import { login, register, me, changePassword, loginSchema, registerSchema, changePasswordSchema } from './auth.controller.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), login);
router.get('/me', requireAuth, me);
router.post('/password', requireAuth, passwordChangeLimiter, validate(changePasswordSchema), changePassword);

// Only admins can create new accounts.
router.post('/register', requireAuth, requireRole('admin'), validate(registerSchema), register);

export default router;
