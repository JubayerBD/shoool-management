import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { login, register, me, loginSchema, registerSchema } from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.get('/me', requireAuth, me);

// Only admins can create new accounts.
router.post('/register', requireAuth, requireRole('admin'), validate(registerSchema), register);

export default router;
