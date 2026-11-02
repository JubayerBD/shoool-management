import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { navForRole } from '../../client/src/config/nav.js';

let mongo, server, base, m, admin, teacher, accountant, learner, year, klass, section, subject, staff, student, exam, signToken, schoolDate;
async function request(path, body, user = admin, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${signToken({ sub: user.id, sessionVersion: user.sessionVersion || 0 })}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
}
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('individual_feature_tests'); process.env.JWT_SECRET = 'isolated-feature-tests'; process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../src/app.js'); m = mongoose.models;
  ({ signToken } = await import('../src/utils/jwt.js')); ({ schoolDate } = await import('../src/utils/financeDates.js'));
  await Promise.all(Object.values(m).map((model) => model.init()));
  const user = (role) => m.User.create({ name: { en: role }, email: `${role}@features.test`, role, passwordHash: 'unused' });
  admin = await user('admin'); teacher = await user('teacher'); accountant = await user('accountant'); learner = await user('student');
  year = await m.AcademicYear.create({ name: { en: '2026' }, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') });
  klass = await m.Class.create({ name: { en: 'Class 6' }, academicYear: year.id });
  section = await m.Section.create({ name: { en: 'A' }, class: klass.id });
  subject = await m.Subject.create({ name: { en: 'Mathematics' }, class: klass.id });
  staff = await m.Teacher.create({ name: { en: 'Test Teacher' }, employeeId: 'QA-T1' });
  student = await m.Student.create({ name: { en: 'Test Student' }, admissionNo: 'QA-S1', class: klass.id, section: section.id, academicYear: year.id });
  exam = await m.Exam.create({ name: { en: 'Final' }, academicYear: year.id, isPublished: true });
  server = createApp().listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120000 });
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await mongo?.stop(); });

test('academic setup: create, edit, search, delete unused records and validate related fields on partial edits', async () => {
  const created = await request('/academics/subjects', { name: { en: 'QA Elective' }, class: klass.id, fullMarks: 100, passMarks: 33 });
  assert.equal(created.status, 201);
  assert.equal((await request(`/academics/subjects/${created.item.id}`, { fullMarks: 20 }, admin, 'PUT')).status, 400, 'pass marks cannot exceed a partially updated full-mark value');
  assert.equal((await request(`/academics/academic-years/${year.id}`, { endDate: '2025-01-01' }, admin, 'PUT')).status, 400);
  assert.equal((await request('/academics/subjects?search=QA%20Elective')).total, 1);
  assert.equal((await request(`/academics/subjects/${created.item.id}`, undefined, admin, 'DELETE')).status, 200);
  assert.equal((await request(`/academics/classes/${klass.id}`, undefined, admin, 'DELETE')).status, 409);
});

test('people and academic references: reject nonexistent class IDs and sections belonging to another class', async () => {
  const other = await m.Class.create({ name: { en: 'Class 7' }, academicYear: year.id });
  assert.equal((await request('/people/students', { name: { en: 'Wrong class' }, admissionNo: 'QA-BAD-1', class: other.id, section: section.id })).status, 400);
  assert.equal((await request('/academics/sections', { name: { en: 'Missing class' }, class: new mongoose.Types.ObjectId().toString() })).status, 400);
  const created = await request('/people/teachers', { name: { en: 'QA Teacher' }, employeeId: 'QA-CRUD', subjects: [subject.id] });
  assert.equal(created.status, 201);
  assert.equal((await request(`/people/teachers/${created.item.id}`, { phone: '01700000000' }, admin, 'PUT')).status, 200);
  assert.equal((await request(`/people/teachers/${created.item.id}`, undefined, admin, 'DELETE')).status, 200);
});

test('attendance: save/update daily statuses, retain marking staff, reject invalid dates and duplicate students', async () => {
  const body = { section: section.id, date: schoolDate(), records: [{ student: student.id, status: 'present' }] };
  assert.equal((await request('/attendance/bulk', body, teacher)).status, 200);
  assert.equal(String((await m.Attendance.findOne({ student: student.id })).markedBy), teacher.id);
  assert.equal((await request('/attendance/bulk', { ...body, date: '2026-02-30' }, teacher)).status, 400);
  assert.equal((await request('/attendance/bulk', { ...body, records: [...body.records, { student: student.id, status: 'absent' }] }, teacher)).status, 400);
  await request('/attendance/bulk', { ...body, records: [{ student: student.id, status: 'late' }] }, teacher);
  const summary = await request(`/attendance/summary/${student.id}`, undefined, teacher);
  assert.equal(summary.summary.total, 1); assert.equal(summary.summary.late, 1);
});

test('exams: validate every mark reference before bulk writes and retain entering staff', async () => {
  const mark = { student: student.id, subject: subject.id, marksObtained: 85, fullMarks: 100 };
  const invalid = await request('/exams/marks', { exam: exam.id, marks: [mark, { ...mark, student: new mongoose.Types.ObjectId().toString() }] }, teacher);
  assert.equal(invalid.status, 400);
  assert.equal(await m.Mark.countDocuments({ exam: exam.id }), 0, 'invalid batches must not partially save');
  assert.equal((await request('/exams/marks', { exam: exam.id, marks: [mark] }, teacher)).status, 200);
  assert.equal(String((await m.Mark.findOne({ student: student.id })).enteredBy), teacher.id);
  const report = await request(`/exams/report-card?exam=${exam.id}&student=${student.id}`);
  assert.equal(report.reportCard.result, 'Pass'); assert.equal(report.reportCard.gpa, 5);
  assert.equal((await request(`/exams/tabulation?exam=${exam.id}&section=${new mongoose.Types.ObjectId()}`)).status, 404);
});

test('notices: attribute author correctly and do not reveal scheduled notices before publication', async () => {
  const created = await request('/schedule/notices', { title: { en: 'Future announcement' }, publishedAt: '2099-01-01', audience: ['student'] });
  assert.equal(created.status, 201);
  assert.equal(created.item.createdBy, admin.id);
  const visible = await request('/schedule/notices', undefined, learner);
  assert.ok(!visible.items.some((notice) => notice.id === created.item.id));
  assert.equal((await request(`/schedule/notices/${created.item.id}`, undefined, learner)).status, 404);
});

test('security: database update operators cannot bypass finance amount validation', async () => {
  const income = await request('/finance/income', { amount: 100, reference: 'QA-INV' }, accountant);
  assert.equal(income.status, 201);
  const attack = await request(`/finance/income/${income.item.id}`, { reference: 'QA-INV', $inc: { amount: -500 } }, accountant, 'PUT');
  assert.equal(attack.status, 400);
  assert.equal((await m.Income.findById(income.item.id)).amount, 100);
});

test('partners: a later-month deposit cannot change an earlier-month profit preview', async () => {
  const partners = await m.Partner.create(['QA Capital A', 'QA Capital B'].map((name) => ({ name, phone: '01700000000', address: 'Dhaka' })));
  for (const [index, amountCents, date] of [[0, 10000000, '2010-01-01'], [1, 5000000, '2010-01-01'], [0, 10000000, '2010-02-01']]) {
    await m.PartnerDeposit.create({ partner: partners[index].id, amountCents, date, requestKey: randomUUID(), recordedBy: admin.id });
  }
  await m.Income.create({ amount: 100, date: new Date('2010-01-15') });
  const preview = await request('/finance/profit/preview', { from: '2010-01-01', to: '2010-01-31', incomeCategories: ['uncategorized-income'], expenseCategories: [] });
  assert.equal(preview.report.allocations.find((p) => p.id === partners[0].id).profit, 66.67);
});

test('CSV import: quoted names, duplicate admission numbers and section-only class inference', async () => {
  const form = new FormData();
  form.append('file', new Blob(['admissionNo,nameEn,sectionName\nQA-CSV-1,"Quoted, Student",A\nQA-S1,Duplicate,A\n'], { type: 'text/csv' }), 'students.csv');
  const response = await fetch(base + '/people/students/import', { method: 'POST', headers: { Authorization: `Bearer ${signToken({ sub: admin.id })}` }, body: form });
  const result = await response.json();
  assert.equal(response.status, 201); assert.equal(result.created, 1); assert.equal(result.failed.length, 1);
  const imported = await m.Student.findOne({ admissionNo: 'QA-CSV-1' });
  assert.equal(imported.name.en, 'Quoted, Student'); assert.equal(String(imported.class), klass.id);
});

test('accounts: password resets invalidate old sessions and deleted/disabled users cannot authenticate', async () => {
  const account = new m.User({ name: { en: 'Session Test' }, email: 'session@features.test', role: 'teacher' });
  await account.setPassword('original-password'); await account.save();
  const login = await request('/auth/login', { email: account.email, password: 'original-password' }, null);
  assert.equal(login.status, 200);
  assert.equal((await request(`/users/${account.id}/password`, { password: 'replacement-password' })).status, 200);
  const response = await fetch(base + '/auth/me', { headers: { Authorization: `Bearer ${login.token}` } });
  assert.equal(response.status, 401, 'old sessions must be revoked after password reset');
  await request(`/users/${account.id}`, { isActive: false }, admin, 'PUT');
  assert.equal((await request('/auth/login', { email: account.email, password: 'replacement-password' }, null)).status, 401);
});

test('academic calendar: Friday weekend, official holidays, school closures, edits and access', async () => {
  let result = await request('/calendar?from=2026-11-06&to=2026-11-08');
  assert.equal(result.status, 200);
  assert.equal(result.days[0].date, '2026-11-06');
  assert.equal(result.days[0].weekend, true);
  assert.equal(result.days[1].closed, true, 'November 7 additional government holiday');
  assert.equal(result.days[2].closed, false);
  assert.equal((await request('/calendar?from=2026-02-30&to=2026-03-02')).status,400);
  assert.equal((await request('/calendar?from=2026-11-06&to=2026-11-08',undefined,teacher)).status,200);
  assert.equal((await request('/calendar?from=2026-11-06&to=2026-11-08',undefined,accountant)).status,403);
  const body = { title:'School vacation', start:'2026-11-08', end:'2026-11-10', closed:true, kind:'vacation' };
  assert.equal((await request('/calendar/events',body,teacher)).status,403);
  assert.equal((await request('/calendar/events',{...body,end:'2026-11-01'})).status,400);
  const event = await request('/calendar/events',body); assert.equal(event.status,201);
  result = await request('/calendar?from=2026-11-08&to=2026-11-10');
  assert.ok(result.days.every((d) => d.closed));
  assert.equal((await request(`/calendar/events/${event.item.key}`,{...body,closed:false},admin,'PUT')).status,200);
  result = await request('/calendar?from=2026-11-08&to=2026-11-10'); assert.ok(result.days.every((d) => !d.closed));
  assert.equal((await request(`/calendar/events/${event.item.key}`,undefined,admin,'DELETE')).status,200);
  const holidays = await request('/calendar?from=2026-12-16&to=2026-12-16');
  const gov = holidays.events.find((e) => e.kind === 'government'); assert.ok(gov);
  assert.equal((await request(`/calendar/events/${gov.key}`, {...gov,start:'2026-12-17',end:'2026-12-17'},admin,'PUT')).status,200);
  assert.equal((await request('/calendar?from=2026-12-16&to=2026-12-16')).days[0].closed,false);
  await m.CalendarEvent.deleteMany({});
});

test('timetable: multiple selected days save together and conflicts never partially save', async () => {
  const body = { section: section.id, subject: subject.id, teacher: staff.id, daysOfWeek: [0, 2, 4], startTime: '13:00', endTime: '13:45' };
  assert.equal((await request('/schedule/timetable/bulk', body, teacher)).status, 403);
  const created = await request('/schedule/timetable/bulk', body);
  assert.equal(created.status, 201);
  assert.equal((await request('/schedule/timetable/bulk', { ...body, daysOfWeek: [5] })).status, 400);
  assert.deepEqual(created.items.map((s) => s.dayOfWeek), [0, 2, 4]);
  assert.equal((await request('/schedule/timetable/bulk', { ...body, daysOfWeek: [1, 2, 3] })).status, 409);
  assert.equal(await m.TimetableSlot.countDocuments({ startTime: '13:00' }), 3);
  const other = await m.Section.create({ name: { en: 'Timetable B' }, class: klass.id });
  assert.equal((await request('/schedule/timetable/bulk', { ...body, section: other.id, daysOfWeek: [1, 4] })).status, 409);
  assert.equal(await m.TimetableSlot.countDocuments({ section: other.id }), 0);
  for (const daysOfWeek of [[], [0, 0], [7], ['1'], null]) {
    assert.equal((await request('/schedule/timetable/bulk', { ...body, daysOfWeek })).status, 400);
  }
  assert.equal((await request('/schedule/timetable/bulk', { ...body, daysOfWeek: [1], subject: new mongoose.Types.ObjectId().toString() })).status, 400);
  const week = await request('/schedule/timetable/bulk', { ...body, startTime: '14:00', endTime: '14:45', daysOfWeek: [0, 1, 2, 3, 4, 6] });
  assert.equal(week.status, 201);
  assert.equal(week.items.length, 6);
  await m.TimetableSlot.deleteMany({ _id: { $in: [...created.items, ...week.items].map((s) => s.id) } });
});

test('timetable: create, edit, reject overlaps and invalid references, then remove unused periods', async () => {
  const body = { section: section.id, subject: subject.id, teacher: staff.id, dayOfWeek: 0, startTime: '09:00', endTime: '10:00' };
  assert.equal((await request('/schedule/timetable', body, teacher)).status, 403);
  const created = await request('/schedule/timetable', body);
  assert.equal(created.status, 201);
  assert.equal((await request('/schedule/timetable', { ...body, startTime: '09:30' })).status, 409);
  assert.equal((await request('/schedule/timetable', { ...body, dayOfWeek: 1, subject: new mongoose.Types.ObjectId().toString() })).status, 400);
  assert.equal((await request(`/schedule/timetable/${created.item.id}`, { startTime: '08:00', endTime: '09:00' }, admin, 'PUT')).status, 200);
  assert.equal((await request(`/schedule/timetable/${created.item.id}`, undefined, admin, 'DELETE')).status, 200);
});

test('uploads: save and retrieve a real PNG, reject truncated images and unauthorized uploads', async () => {
  const { uploadsDir } = await import('../src/utils/storage.js');
  const upload = async (bytes, user = teacher) => {
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), 'photo.png');
    const response = await fetch(base + '/uploads', { method: 'POST', headers: { Authorization: `Bearer ${signToken({ sub: user.id })}` }, body: form });
    return { status: response.status, ...await response.json() };
  };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xZkAAAAASUVORK5CYII=', 'base64');
  const valid = await upload(png);
  assert.equal(valid.status, 201);
  try {
    const downloaded = await fetch(base.replace(/\/api$/, '') + valid.url);
    assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
  } finally { await unlink(path.join(uploadsDir, valid.filename)); }
  const truncated = await upload(png.subarray(0, 4));
  if (truncated.filename) await unlink(path.join(uploadsDir, truncated.filename));
  assert.equal(truncated.status, 400);
  assert.equal((await upload(png, learner)).status, 403);
});

test('finance validation: reject boolean amounts and keep used category types stable', async () => {
  assert.equal((await request('/finance/income', { amount: true, reference: 'QA-BOOL' }, accountant)).status, 400);
  const category = (await request('/finance/categories', { type: 'income', name: { en: 'QA Stable category' } })).item;
  assert.equal((await request('/finance/income', { category: category.id, amount: 10, reference: 'QA-STABLE' })).status, 201);
  assert.equal((await request(`/finance/categories/${category.id}`, { type: 'expense' }, admin, 'PUT')).status, 409);
  assert.equal((await request(`/finance/categories/${category.id}`, { name: { en: 'Renamed category' } }, admin, 'PUT')).status, 200);
});

test('role modules: teachers get academic pages; accountants get fees/finance with read-only form lookups', async () => {
  assert.deepEqual(navForRole('teacher').map((n) => n.key), ['students', 'classes', 'sections', 'subjects', 'attendance', 'exams']);
  assert.deepEqual(navForRole('accountant').map((n) => n.key), ['fees', 'finance']);
  for (const endpoint of ['/people/students', '/academics/classes', '/academics/sections', '/academics/subjects', '/attendance', '/exams/exams']) {
    assert.equal((await request(endpoint, undefined, teacher)).status, 200, endpoint);
  }
  for (const endpoint of ['/finance/summary', '/fees/invoices', '/partners', '/activity-logs', '/schedule/notices', '/schedule/timetable', '/dashboard/stats', '/users']) {
    assert.equal((await request(endpoint, undefined, teacher)).status, 403, endpoint);
  }
  for (const endpoint of ['/fees/invoices', '/finance/summary', '/finance/balance', '/people/students', '/people/teachers', '/academics/classes']) {
    assert.equal((await request(endpoint, undefined, accountant)).status, 200, endpoint);
  }
  for (const endpoint of ['/attendance', '/exams/marks', '/partners', '/activity-logs', '/schedule/notices', '/schedule/timetable', '/dashboard/stats', '/users']) {
    assert.equal((await request(endpoint, undefined, accountant)).status, 403, endpoint);
  }
  assert.equal((await request('/academics/classes', { name: { en: 'Not allowed' } }, teacher)).status, 403);
  assert.equal((await request('/people/students', { name: { en: 'Not allowed' }, admissionNo: 'DENIED' }, accountant)).status, 403);
  assert.equal((await request(`/people/students/${student.id}`, { name: { en: 'Not allowed' } }, accountant, 'PUT')).status, 403);
});
