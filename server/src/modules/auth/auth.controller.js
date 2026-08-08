import { z } from 'zod';
import { User } from '../../models/User.js';
import { signToken } from '../../utils/jwt.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES } from '../../models/common.js';

const bilingualName = z.object({
  en: z.string().min(1, 'English name is required'),
  bn: z.string().optional().default(''),
});

export const registerSchema = z.object({
  name: bilingualName,
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(ROLES),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid credentials');

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ sub: user.id, role: user.role });
  res.json({ token, user: publicUser(user) });
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}
