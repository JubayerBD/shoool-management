import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { crudController } from '../../utils/crudController.js';
import { TimetableSlot, Notice } from '../../models/Schedule.js';
import { User } from '../../models/User.js';
import { sendMail } from '../../utils/mailer.js';
import { sendSms } from '../../utils/sms.js';
import { ApiError } from '../../utils/ApiError.js';
import { noticeScopeFor } from '../../utils/access.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate a timetable slot (create or update) and refuse double-booking. */
async function checkSlot(req, _res, next) {
  const existing = req.params.id ? await TimetableSlot.findById(req.params.id).lean() : null;
  const slot = { ...(existing || {}), ...req.body };
  if (!TIME.test(String(slot.startTime ?? '')) || !TIME.test(String(slot.endTime ?? ''))) {
    throw ApiError.badRequest('Times must look like 09:00');
  }
  if (slot.endTime <= slot.startTime) throw ApiError.badRequest('End time must be after the start time');
  const overlap = { dayOfWeek: slot.dayOfWeek, startTime: { $lt: slot.endTime }, endTime: { $gt: slot.startTime } };
  if (req.params.id) overlap._id = { $ne: req.params.id };
  if (slot.section && (await TimetableSlot.exists({ ...overlap, section: slot.section }))) {
    throw ApiError.conflict('This section already has a class in that time slot');
  }
  if (slot.teacher && (await TimetableSlot.exists({ ...overlap, teacher: slot.teacher }))) {
    throw ApiError.conflict('This teacher is already teaching another class in that time slot');
  }
  next();
}

const router = Router();
const admin = requireRole('admin');

/** Email the targeted audience about a new notice (fire-and-forget). */
async function notifyNoticeAudience(notice) {
  try {
    const audience = notice.audience?.length ? notice.audience : ['all'];
    const filter = audience.includes('all') ? {} : { role: { $in: audience } };
    const recipients = await User.find({ ...filter, isActive: true })
      .select('email phone')
      .lean();
    const emails = recipients.map((u) => u.email).filter(Boolean);
    const phones = recipients.map((u) => u.phone).filter(Boolean);

    const title = notice.title?.en || notice.title?.bn || 'New notice';
    const body = notice.body?.en || notice.body?.bn || '';

    if (emails.length) {
      await sendMail({
        to: emails,
        subject: `[Notice] ${title}`,
        text: `${title}\n\n${body}`,
        html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`,
      });
    }
    if (phones.length) {
      await sendSms(phones, `[Notice] ${title}${body ? ` - ${body}` : ''}`.slice(0, 300));
    }
  } catch {
    /* notifications must never break the request */
  }
}

/* ---- Timetable ---- */
const slots = crudController(TimetableSlot, {
  populate: ['section', 'subject', 'teacher'],
  filterable: ['section', 'teacher', 'dayOfWeek'],
  defaultSort: { dayOfWeek: 1, startTime: 1 },
});

router.get('/timetable', requireAuth, slots.list);
router.get('/timetable/:id', requireAuth, slots.get);
router.post('/timetable', requireAuth, requireRole('admin', 'teacher'), checkSlot, slots.create);
router.put('/timetable/:id', requireAuth, requireRole('admin', 'teacher'), checkSlot, slots.update);
router.delete('/timetable/:id', requireAuth, requireRole('admin', 'teacher'), slots.remove);

/* ---- Notices ---- */
const notices = crudController(Notice, {
  populate: ['createdBy'],
  searchable: ['title.en', 'title.bn', 'body.en', 'body.bn'],
  filterable: ['isPinned'],
  defaultSort: { isPinned: -1, publishedAt: -1 },
});

// Non-admins only see notices addressed to them (or to everyone) that haven't expired.
const visibleNotices = (req, _res, next) => {
  req.noticeScope = noticeScopeFor(req.user);
  next();
};
router.get('/notices', requireAuth, visibleNotices, async (req, res, next) => {
  if (!req.noticeScope) return notices.list(req, res, next);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const filter = { ...req.noticeScope };
  if (typeof req.query.search === 'string' && req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [...filter.$and, { $or: ['title.en', 'title.bn', 'body.en', 'body.bn'].map((path) => ({ [path]: rx })) }];
  }
  if (req.query.isPinned === 'true' || req.query.isPinned === 'false') filter.isPinned = req.query.isPinned === 'true';
  const [items, total] = await Promise.all([
    Notice.find(filter).populate('createdBy').sort({ isPinned: -1, publishedAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notice.countDocuments(filter),
  ]);
  return res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
});
router.get('/notices/:id', requireAuth, visibleNotices, async (req, res, next) => {
  if (req.noticeScope && !(await Notice.exists({ _id: req.params.id, ...req.noticeScope }))) {
    throw ApiError.notFound('Notice not found');
  }
  return notices.get(req, res, next);
});
router.post('/notices', requireAuth, admin, async (req, res) => {
  req.body.createdBy = req.user.id;
  const notice = await Notice.create(req.body);
  // Notify recipients without blocking the response.
  notifyNoticeAudience(notice);
  res.status(201).json({ item: notice });
});
router.put('/notices/:id', requireAuth, admin, notices.update);
router.delete('/notices/:id', requireAuth, admin, notices.remove);

export default router;
