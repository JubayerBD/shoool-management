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

test('student admission imports preserve unknown details, long birth registrations and academic year filters', async () => {
  const payload = {
    admissionNo: 'QA-IMPORT-2026-001', name: { en: 'বাংলা নাম', bn: 'বাংলা নাম' },
    class: klass.id, academicYear: year.id, gender: '', admissionDate: null,
    contactPhone: '01720673223', birthRegistrationNo: '20135628703105801',
    department: 'নূরাণী', notes: 'Official admission and roll numbers were not provided.',
  };
  const created = await request('/people/students', payload);
  assert.equal(created.status, 201);
  assert.equal(created.item.gender, '');
  assert.equal(created.item.admissionDate, null);
  assert.equal(created.item.roll, undefined);
  const edited = await request(`/people/students/${created.item.id}`, { notes: 'Verified class membership.' }, admin, 'PUT');
  assert.equal(edited.status, 200);
  assert.equal(edited.item.contactPhone, payload.contactPhone);
  assert.equal(edited.item.birthRegistrationNo, payload.birthRegistrationNo);
  assert.equal(edited.item.department, payload.department);
  const list = await request(`/people/students?academicYear=${year.id}&class=${klass.id}&search=QA-IMPORT-2026-001`);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].academicYear.id, year.id);
  assert.equal((await request(`/people/students?academicYear=${new mongoose.Types.ObjectId()}&search=QA-IMPORT-2026-001`)).total, 0);
  assert.equal((await request(`/people/students/${created.item.id}`, undefined, admin, 'DELETE')).status, 200);
});

test('student enrollments support two classes, preserve year history and prevent duplicate identities and cross-year matches', async () => {
  const extra = await m.Class.create({ name: { en: 'Noorani' }, academicYear: year.id });
  const nextYear = await m.AcademicYear.create({ name: { en: '2027' }, startDate: new Date('2027-01-01'), endDate: new Date('2027-12-31') });
  const upper = await m.Class.create({ name: { en: 'Class 7' }, academicYear: nextYear.id });
  const records = await m.Enrollment.create([
    { student: student.id, academicYear: year.id, class: klass.id },
    { student: student.id, academicYear: year.id, class: extra.id },
    { student: student.id, academicYear: nextYear.id, class: upper.id },
  ]);
  await assert.rejects(m.Enrollment.create({ student: student.id, academicYear: year.id, class: extra.id }), e => e.code === 11000);
  const cohort = await request(`/people/students?class=${extra.id}&academicYear=${year.id}`);
  assert.equal(cohort.total, 1);
  assert.equal(cohort.items[0].id, student.id);
  assert.equal(cohort.items[0].enrollments.length, 3);
  assert.equal((await request(`/people/students?class=${upper.id}&academicYear=${year.id}`)).total, 0, 'Class and year must match the same enrollment');
  assert.equal((await request(`/people/students?class=${upper.id}&academicYear=${nextYear.id}`)).total, 1);
  assert.equal((await request(`/people/students?search=${student.admissionNo}`)).total, 1, 'Multiple enrollments must not duplicate student rows');
  assert.equal((await request(`/people/students/${student.id}`)).item.enrollments.length, 3);
  assert.equal((await request(`/academics/classes/${extra.id}`, undefined, admin, 'DELETE')).status, 409);
  assert.equal((await request(`/academics/academic-years/${nextYear.id}`, undefined, admin, 'DELETE')).status, 409);
  assert.equal((await request(`/people/students/${student.id}`, undefined, admin, 'DELETE')).status, 409);
  assert.equal((await request('/people/students?class=invalid')).status, 400);
  await m.Enrollment.deleteMany({ _id: { $in: records.map(r => r.id) } });
  await m.Class.deleteMany({ _id: { $in: [extra.id, upper.id] } });
  await m.AcademicYear.deleteOne({ _id: nextYear.id });
});

test('historical paid summaries preserve unknown dates, separate Noorani fees and reconcile without invented dues', async () => {
  const noorani = await m.Class.create({ name: { en: 'Noorani fee test' }, academicYear: year.id });
  const before = await request('/finance/balance');
  const beforeSummary = await request('/finance/summary');
  const beforeAccount = await request(`/fees/accounts/${student.id}`);
  const bills = [], payments = [];
  try {
    for (const [grade, amount, suffix] of [[klass, 1200, 'regular'], [noorani, 1000, 'noorani']]) {
      const key = `historical-fee-test-${suffix}`;
      const bill = await m.Invoice.create({ invoiceNo: `HIST-TEST-${suffix}`, generationKey: key,
        student: student.id, class: grade.id, academicYear: year.id, historicalImport: true,
        period: { en: '2026-01' }, items: [{ title: { en: 'Historical tuition paid' }, amount }],
        totalAmount: amount, grossAmount: amount, paidAmount: amount, status: 'paid', dueDate: null });
      bills.push(bill);
      payments.push(await m.Payment.create({ invoice: bill.id, student: student.id, amount,
        idempotencyKey: key, receiptNo: `HSUM-TEST-${suffix}`, historicalImport: true,
        paidAt: null, method: 'unknown', feePeriod: '2026-01', importedBy: admin.id }));
    }
    const account = await request(`/fees/accounts/${student.id}`);
    assert.equal(account.totals.collected - beforeAccount.totals.collected, 2200);
    assert.equal(account.totals.due, beforeAccount.totals.due);
    assert.ok(account.payments.filter(p => payments.some(x => x.id === p.id)).every(p => p.paidAt === null && p.method === 'unknown'));
    assert.equal(account.ledger.at(-1).balance, beforeAccount.ledger.at(-1)?.balance || 0);
    const summary = await request('/finance/summary');
    assert.equal(summary.summary.income.fees - beforeSummary.summary.income.fees, 2200);
    const dated = await request('/finance/summary?from=2026-01-01&to=2026-12-31');
    assert.equal(dated.summary.income.fees, 0, 'Fee period must not be used as collection date');
    const analytics = await request('/finance/analytics');
    assert.equal(analytics.monthly.find(r => r.label === 'Undated').income, 2200);
    assert.ok(!analytics.monthly.some(r => r.label.startsWith('1970')));
    const balance = await request('/finance/balance');
    assert.equal(balance.currentBalance, before.currentBalance);
    assert.equal(balance.undatedFeeCollections - before.undatedFeeCollections, 2200);
    assert.equal((await request(`/fees/dues-report?class=${noorani.id}`)).totals.paid, 1000);
    assert.equal((await request(`/fees/dues-report?class=${klass.id}`)).totals.paid, 1200);
  } finally {
    await m.Payment.deleteMany({ _id: { $in: payments.map(p => p.id) } });
    await m.Invoice.deleteMany({ _id: { $in: bills.map(p => p.id) } });
    await m.Class.deleteOne({ _id: noorani.id });
  }
});

test('teacher imports preserve unknown personal details and populated subject assignments', async () => {
  const subjects = await m.Subject.create([
    {name:{en:'QA General Social Studies',bn:'সমাজ'},code:'QA-SOC',class:null,fullMarks:null,passMarks:null},
    {name:{en:'QA General Science',bn:'বিজ্ঞান'},code:'QA-SCI',class:null,fullMarks:null,passMarks:null},
  ]);
  let created;
  try {
    const result=await request('/people/teachers',{
      employeeId:'QA-IMPORT-TCH-001',name:{en:'বাংলা শিক্ষক',bn:'বাংলা শিক্ষক'},
      gender:'',joiningDate:null,status:'',subjects:subjects.map(s=>s.id),notes:'Current employment status not confirmed.',
    });
    assert.equal(result.status,201); created=result.item;
    assert.equal(created.gender,'');assert.equal(created.joiningDate,null);assert.equal(created.status,'');
    const detail=await request(`/people/teachers/${created.id}`);
    assert.deepEqual(detail.item.subjects.map(s=>s.code).sort(),['QA-SCI','QA-SOC']);
    const list=await request('/people/teachers?search=QA-IMPORT-TCH-001');
    assert.equal(list.total,1);assert.equal(list.items[0].subjects.length,2);
    assert.equal((await request(`/people/teachers/${created.id}`,{subjects:[new mongoose.Types.ObjectId().toString()]},admin,'PUT')).status,400);
    const edited=await request(`/people/teachers/${created.id}`,{status:'active'},admin,'PUT');
    assert.equal(edited.status,200);assert.equal(edited.item.subjects.length,2);
    assert.equal(edited.item.joiningDate,null);
  } finally {
    if(created)await m.Teacher.deleteOne({_id:created.id});
    await m.Subject.deleteMany({_id:{$in:subjects.map(s=>s.id)}});
  }
});

test('December billing includes secondary Noorani enrollments and unknown admission dates without historical or duplicate invoices', async () => {
  const {previewSchedule,generateScheduleInvoices,upcomingBillsForStudent}=await import('../src/services/feeSchedules.js');
  const noorani=await m.Class.create({name:{en:'Noorani billing QA'},academicYear:year.id});
  const transferredClass=await m.Class.create({name:{en:'Transferred class QA'},academicYear:year.id});
  const pupils=await m.Student.create([
    {admissionNo:'QA-DEC-BILL-1',name:{en:'Unknown admission date'},class:klass.id,academicYear:year.id,admissionDate:null},
    {admissionNo:'QA-DEC-BILL-2',name:{en:'Late admission'},class:klass.id,academicYear:year.id,admissionDate:new Date('2026-12-15')},
    {admissionNo:'QA-DEC-BILL-3',name:{en:'Transferred and withdrawn'},class:transferredClass.id,academicYear:year.id,admissionDate:null},
  ]);
  const types=await m.FeeStructure.create([
    {name:{en:'QA Monthly tuition'},amount:1000,autoGenerate:false},
    {name:{en:'QA Noorani tuition'},amount:1000,autoGenerate:false},
  ]);
  const plans=[],schedules=[];
  try {
    for(const pupil of pupils)await m.Enrollment.create({student:pupil.id,class:noorani.id,academicYear:year.id,isPrimary:false,status:pupil===pupils[2]?'withdrawn':'enrolled'});
    await m.Enrollment.create({student:pupils[2].id,class:klass.id,academicYear:year.id,isPrimary:true});
    for(const [index,grade]of [[0,klass],[1,noorani]]){
      const items=[{feeType:types[index].id,title:types[index].name,amount:1000,optional:false}];
      const plan=await m.FeePlan.create({name:{en:`QA December ${index}`},class:grade.id,academicYear:year.id,items});plans.push(plan);
      const schedule=await m.BillingSchedule.create({name:`QA December ${index}`,plan:plan.id,class:grade.id,academicYear:year.id,items,
        feeTypes:[types[index].id],students:pupils.map(p=>p.id),startDate:'2026-12-01',endDate:'2026-12-31',frequency:'monthly',dueDays:9,status:'active'});
      schedules.push(schedule);
      const safe={...schedule.toObject(),students:[pupils[0].id,pupils[1].id]};
      const preview=await previewSchedule(safe,new Date('2026-11-11T00:00:00Z'));
      assert.equal(preview.summary.invoiceCount,1);assert.equal(preview.summary.total,1000);assert.equal(preview.summary.readyCount,0);
      await assert.rejects(previewSchedule({...safe,students:[pupils[2].id]}),/active and belong/);
      await generateScheduleInvoices(schedule,new Date('2026-11-30T00:00:00Z'));
    }
    assert.equal(await m.Invoice.countDocuments({billingSchedule:{$in:schedules.map(s=>s.id)}}),0);
    const upcoming=await upcomingBillsForStudent(pupils[0],new Date('2026-11-11T00:00:00Z'));
    assert.equal(upcoming.length,2);assert.equal(upcoming.reduce((s,b)=>s+b.totalAmount,0),2000);
    assert.ok(upcoming.every(b=>b.scheduled&&b.paidAmount===0&&b.billingDate==='2026-12-01'));
    assert.equal((await upcomingBillsForStudent(pupils[1],new Date('2026-11-11T00:00:00Z'))).length,0);
    assert.equal((await upcomingBillsForStudent(pupils[2],new Date('2026-11-11T00:00:00Z'))).length,0);
    plans[1].items[0].amount=777;await plans[1].save();
    assert.equal((await upcomingBillsForStudent(pupils[0],new Date('2026-11-11T00:00:00Z'))).reduce((s,b)=>s+b.totalAmount,0),2000,'Forecasts use approved frozen rates');
    for(const schedule of schedules){await generateScheduleInvoices(schedule,new Date('2026-12-01T00:00:00Z'));await generateScheduleInvoices(schedule,new Date('2026-12-01T00:00:00Z'));}
    const bills=await m.Invoice.find({billingSchedule:{$in:schedules.map(s=>s.id)}});
    assert.equal(bills.length,2);assert.ok(bills.every(b=>String(b.student)===pupils[0].id&&b.totalAmount===1000));
    assert.deepEqual(bills.map(b=>String(b.class)).sort(),[klass.id,noorani.id].sort());
    assert.ok(bills.every(b=>b.billingDate==='2026-12-01'&&schoolDate(b.dueDate)==='2026-12-10'));
    assert.equal((await upcomingBillsForStudent(pupils[0],new Date('2026-12-01T00:00:00Z'))).length,0,'Issued invoices must not also appear as scheduled charges');
  }finally{
    await m.Invoice.deleteMany({billingSchedule:{$in:schedules.map(s=>s.id)}});
    await m.BillingSchedule.deleteMany({_id:{$in:schedules.map(s=>s.id)}});await m.FeePlan.deleteMany({_id:{$in:plans.map(p=>p.id)}});
    await m.FeeStructure.deleteMany({_id:{$in:types.map(t=>t.id)}});await m.Enrollment.deleteMany({student:{$in:pupils.map(p=>p.id)}});
    await m.Student.deleteMany({_id:{$in:pupils.map(p=>p.id)}});await m.Class.deleteMany({_id:{$in:[noorani.id,transferredClass.id]}});
  }
});

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

test('attendance migration preserves old section records and replaces the daily uniqueness index safely',async()=>{
  const {migrateAttendanceIndex}=await import('../src/services/attendanceMigration.js');
  const pupil=await m.Student.create({name:{en:'Legacy attendance'},admissionNo:'ATT-LEGACY',class:klass.id,academicYear:year.id,section:section.id});
  const legacy=await m.Attendance.collection.insertOne({student:pupil._id,section:section._id,date:new Date('2026-01-15'),status:'absent'});
  await m.Attendance.collection.createIndex({student:1,date:1},{unique:true});
  await migrateAttendanceIndex();await migrateAttendanceIndex();
  const saved=await m.Attendance.findById(legacy.insertedId);
  assert.equal(String(saved.class),klass.id);assert.equal(String(saved.academicYear),year.id);assert.equal(saved.status,'absent');
  const indexes=await m.Attendance.collection.indexes();
  assert.ok(indexes.some(index=>index.unique&&index.key.class===1));
  assert.ok(!indexes.some(index=>index.unique&&Object.keys(index.key).length===2&&index.key.student===1&&index.key.date===1));
});

test('attendance works without sections, validates enrollment and keeps simultaneous classes separate', async () => {
  const grade = await m.Class.create({name:{en:'No-section class'},academicYear:year.id});
  const noorani = await m.Class.create({name:{en:'Noorani attendance'},academicYear:year.id});
  const otherYear = await m.AcademicYear.create({name:{en:'2025 attendance'},startDate:new Date('2025-01-01'),endDate:new Date('2025-12-31')});
  const pupils=await m.Student.create(['Eligible','Inactive','Withdrawn','Other year'].map((name,index)=>({name:{en:name},admissionNo:`ATT-${index}`,class:grade.id,academicYear:index===3?otherYear.id:year.id,status:index===1?'inactive':'active'})));
  await m.Enrollment.create([{student:pupils[0].id,class:noorani.id,academicYear:year.id,isPrimary:false},{student:pupils[2].id,class:grade.id,academicYear:year.id,status:'withdrawn'}]);
  const params=new URLSearchParams({class:grade.id,academicYear:year.id,date:'2026-01-12'});
  const roster=await request('/attendance/roster?'+params,undefined,teacher);
  assert.equal(roster.status,200);assert.equal(roster.total,1);assert.equal(roster.items[0].student,pupils[0].id);
  assert.equal((await request('/attendance/roster?'+params,undefined,accountant)).status,403);
  assert.equal((await request('/attendance/roster?'+params,undefined,learner)).status,403);
  const body={class:grade.id,academicYear:year.id,date:'2026-01-12',records:[{student:pupils[0].id,status:'absent',remark:'Family called'}]};
  assert.equal((await request('/attendance/bulk',body,teacher)).status,200);
  assert.equal((await request('/attendance/bulk',{...body,records:[{student:pupils[0].id,status:'late'}]},teacher)).status,200);
  assert.equal(await m.Attendance.countDocuments({student:pupils[0].id,class:grade.id}),1);
  const loaded=await request('/attendance/roster?'+params,undefined,teacher);
  assert.equal(loaded.items[0].status,'late');
  assert.equal(roster.marked,false);assert.equal(loaded.marked,true);
  const report=await request('/attendance/report?'+new URLSearchParams({class:grade.id,academicYear:year.id,month:'2026-01'}),undefined,teacher);
  assert.equal(report.status,200);assert.equal(report.students.length,1);
  assert.deepEqual(report.students[0].days,{'2026-01-12':'late'});
  assert.equal(report.students[0].percentage,100);assert.deepEqual(report.daily.map(day=>[day.date,day.late,day.present,day.total]),[['2026-01-12',1,0,1]]);
  assert.equal((await request('/attendance/report?'+new URLSearchParams({class:grade.id,academicYear:year.id,month:'2026-02'}),undefined,teacher)).daily.length,0);
  assert.equal((await request('/attendance/report?'+new URLSearchParams({class:grade.id,academicYear:year.id,month:'2026-13'}),undefined,teacher)).status,400);
  assert.equal((await request('/attendance/report?'+new URLSearchParams({class:grade.id,academicYear:year.id,month:'2026-01'}),undefined,learner)).status,403);
  for(const pupil of pupils.slice(1))assert.equal((await request('/attendance/bulk',{...body,records:[{student:pupil.id,status:'present'}]},teacher)).status,400);
  assert.equal((await request('/attendance/bulk',{...body,section:section.id},teacher)).status,400);
  assert.equal((await request('/attendance/bulk',{...body,academicYear:otherYear.id},teacher)).status,400);
  assert.equal((await request('/attendance/bulk',{...body,date:'2025-12-31'},teacher)).status,400);
  assert.equal((await request('/attendance/bulk',{...body,date:'2099-01-01'},teacher)).status,400);
  assert.equal((await request('/attendance/bulk',{...body,date:'2026-02-30'},teacher)).status,400);
  assert.equal((await request('/attendance/roster?class=invalid&academicYear='+year.id+'&date=2026-01-12',undefined,teacher)).status,400);
  const secondary=await request('/attendance/roster?'+new URLSearchParams({class:noorani.id,academicYear:year.id,date:body.date}),undefined,teacher);
  assert.equal(secondary.total,1);
  assert.equal((await request('/attendance/bulk',{...body,class:noorani.id,records:[{student:pupils[0].id,status:'present'}]},teacher)).status,200);
  assert.equal(await m.Attendance.countDocuments({student:pupils[0].id}),2);
  assert.equal((await request('/attendance/roster?'+params,undefined,teacher)).items[0].status,'late');
  const record=await m.Attendance.findOne({student:pupils[0].id,class:grade.id});
  assert.equal(record.section,null);assert.equal(String(record.academicYear),year.id);assert.equal(String(record.markedBy),teacher.id);
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
  // Section is optional everywhere: a class alone loads the whole class.
  const wholeClass = await request(`/exams/roster?exam=${exam.id}&class=${klass.id}`, undefined, teacher);
  assert.equal(wholeClass.status, 200); assert.ok(wholeClass.items.some((row) => row.student === student.id));
  const oneSection = await request(`/exams/roster?exam=${exam.id}&class=${klass.id}&section=${section.id}`, undefined, teacher);
  assert.ok(oneSection.total <= wholeClass.total);
  const sheet = await request(`/exams/tabulation?exam=${exam.id}&class=${klass.id}`, undefined, teacher);
  assert.equal(sheet.status, 200); assert.equal(sheet.rows.find((row) => row.student.id === student.id).totalObtained, 85);
  const cards = await request(`/exams/report-cards?exam=${exam.id}&class=${klass.id}`, undefined, teacher);
  assert.equal(cards.cards.find((card) => String(card.student._id) === student.id).result, 'Pass');
  assert.equal((await request(`/exams/tabulation?exam=${exam.id}`, undefined, teacher)).status, 400);
  assert.equal((await request(`/exams/roster?class=${klass.id}`, undefined, accountant)).status, 403);
  assert.equal((await request(`/exams/roster?class=${klass.id}`, undefined, learner)).status, 403);
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
