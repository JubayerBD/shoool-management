import { z } from 'zod';
import { User } from '../../models/User.js';
import { signToken } from '../../utils/jwt.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES } from '../../models/common.js';
import { newPassword } from '../../utils/passwordPolicy.js';
import bcrypt from 'bcryptjs';

const bilingualName = z.object({
  en: z.string().min(1, 'English name is required'),
  bn: z.string().optional().default(''),
});

export const registerSchema = z.object({
  name: bilingualName,
  email: z.string().email(),
  password: newPassword,
  role: z.enum(ROLES),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword,
});

// Compared against when the account does not exist, so response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function publicUser(user) {
  return {
    // requireAuth attaches a lean doc (no `id` virtual), so fall back to _id.
    id: user.id || (user._id && String(user._id)),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    student: user.student,
    teacher: user.teacher,
    children: user.children,
  };
}

/** Admin-only in practice (guarded at the route), but usable for first setup. */
export async function register(req, res) {
  const { name, email, password, role, phone } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const user = new User({ name, email, role, phone });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ user: publicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ sub: user.id, role: user.role, sessionVersion: user.sessionVersion || 0 });
  req.user = user; // Attribute the login event without logging credentials.
  res.json({ token, user: publicUser(user) });
}

/** Any signed-in user changes their own password; every other session is signed out. */
export async function changePassword(req, res) {
  const { currentPassword, newPassword: next } = req.body;
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || !(await user.verifyPassword(currentPassword))) {
    res.locals.wrongCurrentPassword = true;
    throw ApiError.badRequest('Current password is incorrect');
  }
  if (next === currentPassword) throw ApiError.badRequest('New password must be different from the current password');
  if (next.toLowerCase() === user.email) throw ApiError.badRequest('Password must not be your email address');
  await user.setPassword(next); // bumps sessionVersion: older tokens stop working
  await user.save();
  const token = signToken({ sub: user.id, role: user.role, sessionVersion: user.sessionVersion || 0 });
  res.json({ ok: true, token });
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}
