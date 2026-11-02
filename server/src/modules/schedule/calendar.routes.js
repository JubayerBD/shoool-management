import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { CalendarEvent, calendarRange, governmentHolidays } from '../../services/academicCalendar.js';
import { parseDay } from '../../utils/financeDates.js';
import { ApiError } from '../../utils/ApiError.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (req,res) => res.json(await calendarRange(req.query.from, req.query.to)));
function clean(body) {
  const { title, start, end, closed, kind, note = '' } = body;
  if (typeof title !== 'string' || !title.trim() || typeof closed !== 'boolean' || !['government','vacation','exam','event'].includes(kind)) throw ApiError.badRequest('Title, event type and closure status are required');
  parseDay(start); parseDay(end);
  if (end < start) throw ApiError.badRequest('End date must follow start date');
  return { title: title.trim(), start, end, closed, kind, note, disabled: false };
}
router.post('/events', requireRole('admin'), async (req,res) => res.status(201).json({ item: await CalendarEvent.create({ ...clean(req.body), key: randomUUID() }) }));
router.put('/events/:key', requireRole('admin'), async (req,res) => {
  const existing = await CalendarEvent.findOne({ key: req.params.key });
  if (!existing && !governmentHolidays.some((e) => e.key === req.params.key)) throw ApiError.notFound('Calendar event not found');
  res.json({ item: await CalendarEvent.findOneAndUpdate({ key: req.params.key }, { $set: clean(req.body) }, { new: true, upsert: true, runValidators: true }) });
});
router.delete('/events/:key', requireRole('admin'), async (req,res) => {
  const event = await CalendarEvent.findOne({ key: req.params.key }) || governmentHolidays.find((e) => e.key === req.params.key);
  if (!event) throw ApiError.notFound('Calendar event not found');
  await CalendarEvent.findOneAndUpdate({ key: req.params.key }, { $set: { title: event.title, start: event.start, end: event.end, kind: event.kind, closed: event.closed, disabled: true } }, { upsert: true, runValidators: true });
  res.json({ ok: true });
});
export default router;
