import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { crudController } from '../../utils/crudController.js';
import { TimetableSlot, Notice } from '../../models/Schedule.js';
import { User } from '../../models/User.js';
import { sendMail } from '../../utils/mailer.js';
import { sendSms } from '../../utils/sms.js';

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
        html: `<h2>${title}</h2><p>${body.replace(/\n/g, '<br>')}</p>`,
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
router.post('/timetable', requireAuth, requireRole('admin', 'teacher'), slots.create);
router.put('/timetable/:id', requireAuth, requireRole('admin', 'teacher'), slots.update);
router.delete('/timetable/:id', requireAuth, requireRole('admin', 'teacher'), slots.remove);

/* ---- Notices ---- */
const notices = crudController(Notice, {
  populate: ['createdBy'],
  searchable: ['title.en', 'title.bn', 'body.en', 'body.bn'],
  filterable: ['isPinned'],
  defaultSort: { isPinned: -1, publishedAt: -1 },
});

router.get('/notices', requireAuth, notices.list);
router.get('/notices/:id', requireAuth, notices.get);
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
