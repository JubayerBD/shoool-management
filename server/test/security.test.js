// Regression tests for access control, validation and data-integrity rules found during QA.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongo, server, base, signToken;
let Student, Teacher, Section, Class, AcademicYear, Subject, Exam, Mark, Invoice, FinanceCategory, User;
let admin, accountant, teacherUser, studentUser, parentUser;
let own, other, year, klass, section, subject;

async function request(path, user, body, method = body !== undefined ? 'POST' : 'GET') {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${signToken({ sub: user.id, role: user.role })}`;
  const response = await fetch(base + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  let json = {};
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, ...json };
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = mongo.getUri('security_tests');
  process.env.JWT_SECRET = 'isolated-security-test-secret';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(process.env.MONGO_URI);
  ({ Student, Teacher } = await import('../src/models/People.js'));
  ({ Section, Class, AcademicYear, Subject } = await import('../src/models/Academic.js'));
  ({ Exam, Mark } = await import('../src/models/Exam.js'));
  ({ Invoice } = await import('../src/models/Fees.js'));
  ({ FinanceCategory } = await import('../src/models/Finance.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ signToken } = await import('../src/utils/jwt.js'));
  const { createApp } = await import('../src/app.js');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  year = await AcademicYear.create({ name: { en: '2026' }, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') });
  klass = await Class.create({ name: { en: 'Class 6' }, academicYear: year.id });
  section = await Section.create({ name: { en: 'A' }, class: klass.id });
  subject = await Subject.create({ name: { en: 'Math' }, class: klass.id });
  [own, other] = await Student.create(['Own', 'Other'].map((name, n) => ({
    name: { en: name }, admissionNo: `SEC-${n}`, class: klass.id, section: section.id, academicYear: year.id,
    guardians: [{ name: { en: 'Guardian' }, phone: '01700000000' }],
  })));
  const makeUser = (role, extra = {}) => User.create({ name: { en: role }, email: `${role}-${randomUUID()}@test.local`, passwordHash: 'unused', role, ...extra });
  admin = await makeUser('admin');
  accountant = await makeUser('accountant');
  teacherUser = await makeUser('teacher');
  studentUser = await makeUser('student', { student: own._id });
  parentUser = await makeUser('parent', { children: [own._id] });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
}, { timeout: 120_000 });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test('students and parents cannot read other students’ profiles, marks or attendance', async () => {
  assert.equal((await request(`/people/students/${own.id}`, studentUser)).status, 200);
  assert.equal((await request(`/people/students/${other.id}`, studentUser)).status, 403);
  assert.equal((await request(`/people/students/${other.id}`, parentUser)).status, 403);
  assert.equal((await request(`/attendance/summary/${other.id}`, studentUser)).status, 403);
  assert.equal((await request(`/exams/marks?student=${other.id}`, studentUser)).status, 403);
  assert.equal((await request(`/exams/report-card?exam=${new mongoose.Types.ObjectId()}&student=${other.id}`, studentUser)).status, 403);
  const list = await request('/attendance', studentUser);
  assert.equal(list.status, 200);
  assert.ok(list.items.every((row) => String(row.student.id || row.student._id) === own.id));
});

test('accountants have no access to marks and attendance', async () => {
  assert.equal((await request('/attendance', accountant)).status, 403);
  assert.equal((await request(`/exams/marks?student=${own.id}`, accountant)).status, 403);
});

test('unpublished exam results are hidden from students and parents', async () => {
  const exam = await Exam.create({ name: { en: 'Final' }, academicYear: year.id, isPublished: false });
  await Mark.create({ exam: exam.id, student: own.id, subject: subject.id, marksObtained: 70, fullMarks: 100, grade: 'A', gradePoint: 4 });
  assert.equal((await request(`/exams/report-card?exam=${exam.id}&student=${own.id}`, studentUser)).status, 403);
  assert.equal((await request(`/exams/report-card?exam=${exam.id}&student=${own.id}`, parentUser)).status, 403);
  assert.equal((await request(`/exams/exams/${exam.id}`, studentUser)).status, 404);
  assert.ok(!(await request('/exams/exams', studentUser)).items.some((item) => item.id === exam.id));
  assert.equal((await request(`/exams/report-card?exam=${exam.id}&student=${own.id}`, teacherUser)).status, 200);
  await Exam.updateOne({ _id: exam.id }, { isPublished: true });
  const published = await request(`/exams/report-card?exam=${exam.id}&student=${own.id}`, studentUser);
  assert.equal(published.status, 200);
  assert.equal(published.reportCard.subjects.length, 1);
});

test('marks are validated: not above full marks, exam must exist, ids must be valid', async () => {
  const exam = await Exam.create({ name: { en: 'Term' }, academicYear: year.id });
  const entry = (extra) => ({ exam: exam.id, marks: [{ student: own.id, subject: subject.id, marksObtained: 50, fullMarks: 100, ...extra }] });
  assert.equal((await request('/exams/marks', teacherUser, entry({ marksObtained: 150 }))).status, 400);
  assert.equal((await request('/exams/marks', teacherUser, entry({ marksObtained: -1 }))).status, 400);
  assert.equal((await request('/exams/marks', teacherUser, entry({ student: 'not-an-id' }))).status, 400);
  assert.equal((await request('/exams/marks', teacherUser, { ...entry(), exam: String(new mongoose.Types.ObjectId()) })).status, 400);
  assert.equal((await request('/exams/marks', teacherUser, entry())).status, 200);
  const empty = await request(`/exams/report-card?exam=${exam.id}&student=${other.id}`, teacherUser);
  assert.equal(empty.reportCard.result, '-');
  assert.equal((await request('/exams/report-card', teacherUser)).status, 400);
  assert.equal((await request('/exams/tabulation', teacherUser)).status, 400);
});

test('attendance rejects future dates, unknown sections and students from another section', async () => {
  const otherSection = await Section.create({ name: { en: 'B' }, class: klass.id });
  const post = (extra) => request('/attendance/bulk', teacherUser, { section: section.id, date: '2026-01-05', records: [{ student: own.id, status: 'present' }], ...extra });
  assert.equal((await post()).status, 200);
  assert.equal((await post({ date: '2099-01-01' })).status, 400);
  assert.equal((await post({ section: String(new mongoose.Types.ObjectId()) })).status, 400);
  assert.equal((await post({ section: otherSection.id })).status, 400);
  assert.equal((await request('/attendance/summary/not-an-id', admin)).status, 400);
});

test('academic data is validated and protected from deletion while in use', async () => {
  const year2 = await request('/academics/academic-years', admin, { name: { en: 'Bad' }, startDate: '2031-12-31', endDate: '2031-01-01' });
  assert.equal(year2.status, 400);
  assert.equal((await request('/academics/sections', admin, { name: { en: 'X' }, class: klass.id, capacity: -3 })).status, 400);
  assert.equal((await request('/academics/subjects', admin, { name: { en: 'Y' }, fullMarks: 50, passMarks: 80 })).status, 400);
  assert.equal((await request(`/academics/classes/${klass.id}`, admin, undefined, 'DELETE')).status, 409);
  assert.equal((await request(`/academics/sections/${section.id}`, admin, undefined, 'DELETE')).status, 409);
  await Invoice.create({ invoiceNo: 'INV-SEC-1', student: own.id, items: [{ title: { en: 'Fee' }, amount: 10 }], totalAmount: 10 });
  assert.equal((await request(`/people/students/${own.id}`, admin, undefined, 'DELETE')).status, 409);
});

test('list queries ignore operator injection and unsafe sort values', async () => {
  const injected = await request('/people/students?status[$ne]=active&limit=200', admin);
  assert.equal(injected.status, 200);
  assert.ok(injected.items.every((item) => item.status === 'active'));
  assert.ok((await request('/people/students?sort=%24where', admin)).status < 500);
});

test('finance entries enforce positive 2-decimal amounts, matching categories and valid salaries', async () => {
  const income = await FinanceCategory.create({ type: 'income', name: { en: 'Donation' } });
  const expense = await FinanceCategory.create({ type: 'expense', name: { en: 'Utilities' } });
  const add = (body) => request('/finance/income', accountant, { reference: 'INV-SEC-001', ...body });
  assert.equal((await add({ amount: 0, category: income.id })).status, 400);
  assert.equal((await add({ amount: -5, category: income.id })).status, 400);
  assert.equal((await add({ amount: 10.999, category: income.id })).status, 400);
  assert.equal((await add({ amount: 'abc', category: income.id })).status, 400);
  assert.equal((await add({ amount: 5, category: expense.id })).status, 400);
  assert.equal((await add({ amount: 5, category: String(new mongoose.Types.ObjectId()) })).status, 400);
  assert.equal((await add({ amount: 25.5, category: income.id, source: 'Donor' })).status, 201);
  assert.equal((await request(`/finance/categories/${income.id}`, accountant, undefined, 'DELETE')).status, 409);

  const staff = await Teacher.create({ employeeId: 'SEC-T1', name: { en: 'Staff' } });
  const salary = (body) => request('/finance/salaries', accountant, { staff: staff.id, month: '2026-10', basic: 1000, allowances: 0, deductions: 0, ...body });
  assert.equal((await salary({ month: 'October' })).status, 400);
  assert.equal((await salary({ staff: String(new mongoose.Types.ObjectId()) })).status, 400);
  assert.equal((await salary({ basic: -1 })).status, 400);
  assert.equal((await salary({ deductions: 5000 })).status, 400);
  assert.equal((await salary()).status, 201);
  assert.equal((await salary()).status, 409);
  assert.equal((await request('/finance/salary-structures', accountant, { staff: staff.id, basic: -1 })).status, 400);
});

test('admins cannot lock themselves out and timetable slots cannot overlap', async () => {
  assert.equal((await request(`/users/${admin.id}`, admin, { role: 'student' }, 'PUT')).status, 400);
  assert.equal((await request(`/users/${admin.id}`, admin, { isActive: false }, 'PUT')).status, 400);
  assert.equal((await request(`/users/${admin.id}`, admin, undefined, 'DELETE')).status, 400);
  const slot = (extra) => ({ section: section.id, subject: subject.id, dayOfWeek: 2, startTime: '09:00', endTime: '09:45', ...extra });
  assert.equal((await request('/schedule/timetable', admin, slot())).status, 201);
  assert.equal((await request('/schedule/timetable', admin, slot({ startTime: '09:30', endTime: '10:00' }))).status, 409);
  assert.equal((await request('/schedule/timetable', admin, slot({ startTime: '09:45', endTime: '10:30' }))).status, 201);
  assert.equal((await request('/schedule/timetable', admin, slot({ startTime: '9am', endTime: '10am' }))).status, 400);
  assert.equal((await request('/schedule/timetable', admin, slot({ startTime: '11:00', endTime: '10:00' }))).status, 400);
});

test('notices honour audience and expiry; teacher contact details are hidden from families', async () => {
  const post = (body) => request('/schedule/notices', admin, body);
  await post({ title: { en: 'Teachers only' }, audience: ['teacher'] });
  await post({ title: { en: 'Everyone' }, audience: ['all'] });
  await post({ title: { en: 'Old news' }, expiresAt: '2020-01-01' });
  const titles = async (user) => (await request('/schedule/notices?limit=100', user)).items.map((n) => n.title.en);
  const student = await titles(studentUser);
  assert.ok(student.includes('Everyone') && !student.includes('Teachers only') && !student.includes('Old news'));
  assert.equal((await request('/schedule/notices', teacherUser)).status, 403);
  assert.ok((await titles(admin)).includes('Old news'));
  await Teacher.create({ employeeId: 'SEC-T2', name: { en: 'Visible' }, phone: '01711111111', email: 'private@school.test' });
  const directory = (await request('/people/teachers', studentUser)).items;
  assert.ok(directory.length > 0 && directory.every((t) => !t.phone && !t.email));
});

test('login is rate limited, uploads reject non-images, and responses carry security headers', async () => {
  const user = await User.create({ name: { en: 'Locked' }, email: 'locked@test.local', passwordHash: 'unused', role: 'teacher' });
  let last;
  for (let i = 0; i < 12; i += 1) last = await request('/auth/login', null, { email: user.email, password: `wrong-${i}` });
  assert.equal(last.status, 429);
  const health = await fetch(`${base}/health`);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-powered-by'), null);

  const upload = async (bytes, type, name) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    return fetch(`${base}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${signToken({ sub: admin.id, role: 'admin' })}` }, body: form });
  };
  assert.equal((await upload(Buffer.from('<script>alert(1)</script>'), 'image/png', 'evil.html')).status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const saved = await upload(png, 'image/png', 'photo.html');
  assert.equal(saved.status, 201);
  assert.match((await saved.json()).url, /\.png$/);
});
