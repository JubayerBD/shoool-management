import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { User } from '../../models/User.js';
import { ROLES } from '../../models/common.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();
const adminOnly = [requireAuth, requireRole('admin')];

const bilingualName = z.object({
  en: z.string().min(1, 'English name is required'),
  bn: z.string().optional().default(''),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createSchema = z.object({
  name: bilingualName,
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(ROLES),
  phone: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
  student: objectId.optional(),
  teacher: objectId.optional(),
  children: z.array(objectId).optional(),
});

const updateSchema = z.object({
  name: bilingualName.optional(),
  email: z.string().email().optional(),
  role: z.enum(ROLES).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  student: objectId.nullable().optional(),
  teacher: objectId.nullable().optional(),
  children: z.array(objectId).optional(),
});

const passwordSchema = z.object({ password: z.string().min(6) });

/** Keep only the profile links that make sense for the role. */
function linksForRole(role, src) {
  const links = { student: undefined, teacher: undefined, children: undefined };
  if (role === 'student') links.student = src.student ?? null;
  else if (role === 'teacher') links.teacher = src.teacher ?? null;
  else if (role === 'parent') links.children = src.children ?? [];
  return links;
}

const POPULATE = [
  { path: 'student', select: 'name admissionNo' },
  { path: 'teacher', select: 'name employeeId' },
  { path: 'children', select: 'name admissionNo' },
];

/* ---- List ---- */
router.get('/', ...adminOnly, async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  // Find the account linked to a given profile (used by profile edit screens).
  if (req.query.student) filter.student = req.query.student;
  if (req.query.teacher) filter.teacher = req.query.teacher;
  if (req.query.child) filter.children = req.query.child;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { 'name.en': rx }, { 'name.bn': rx }];
  }
  const items = await User.find(filter).populate(POPULATE).sort({ createdAt: -1 }).limit(500);
  res.json({ items });
});

/* ---- Get one ---- */
router.get('/:id', ...adminOnly, async (req, res) => {
  const item = await User.findById(req.params.id).populate(POPULATE);
  if (!item) throw ApiError.notFound('User not found');
  res.json({ item });
});

/* ---- Create ---- */
router.post('/', ...adminOnly, validate(createSchema), async (req, res) => {
  const { name, email, password, role, phone, isActive } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const user = new User({ name, email, role, phone, isActive, ...linksForRole(role, req.body) });
  await user.setPassword(password);
  await user.save();
  const item = await User.findById(user.id).populate(POPULATE);
  res.status(201).json({ item });
});

/* ---- Update (no password here) ---- */
router.put('/:id', ...adminOnly, validate(updateSchema), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const { name, email, role, phone, isActive } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) {
    // Don't let an admin disable their own account and lock themselves out.
    if (String(user.id) === String(req.user._id) && isActive === false) {
      throw ApiError.badRequest('You cannot disable your own account');
    }
    user.isActive = isActive;
  }
  // Role change re-scopes the profile links.
  const effectiveRole = role || user.role;
  if (role) user.role = role;
  const links = linksForRole(effectiveRole, {
    student: req.body.student !== undefined ? req.body.student : user.student,
    teacher: req.body.teacher !== undefined ? req.body.teacher : user.teacher,
    children: req.body.children !== undefined ? req.body.children : user.children,
  });
  user.student = links.student || undefined;
  user.teacher = links.teacher || undefined;
  user.children = links.children || [];

  await user.save();
  const item = await User.findById(user.id).populate(POPULATE);
  res.json({ item });
});

/* ---- Reset password ---- */
router.post('/:id/password', ...adminOnly, validate(passwordSchema), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  await user.setPassword(req.body.password);
  await user.save();
  res.json({ ok: true });
});

/* ---- Delete (block self) ---- */
router.delete('/:id', ...adminOnly, async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ ok: true, id: req.params.id });
});

export default router;
