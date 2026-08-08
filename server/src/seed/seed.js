/* Seed demo data. Run: npm run seed  (clears and repopulates core collections) */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { AcademicYear, Class, Section, Subject } from '../models/Academic.js';
import { Student, Teacher } from '../models/People.js';
import { Notice } from '../models/Schedule.js';
import { FeeStructure } from '../models/Fees.js';

async function run() {
  await connectDB();
  // eslint-disable-next-line no-console
  console.log('[seed] Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    AcademicYear.deleteMany({}),
    Class.deleteMany({}),
    Section.deleteMany({}),
    Subject.deleteMany({}),
    Student.deleteMany({}),
    Teacher.deleteMany({}),
    Notice.deleteMany({}),
    FeeStructure.deleteMany({}),
  ]);

  // Academic year
  const year = await AcademicYear.create({
    name: { en: '2026', bn: '২০২৬' },
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isCurrent: true,
  });

  // Classes 6, 7, 8
  const classDefs = [
    { en: 'Class 6', bn: 'ষষ্ঠ শ্রেণি', numericLevel: 6 },
    { en: 'Class 7', bn: 'সপ্তম শ্রেণি', numericLevel: 7 },
    { en: 'Class 8', bn: 'অষ্টম শ্রেণি', numericLevel: 8 },
  ];
  const classes = await Class.create(
    classDefs.map((c) => ({
      name: { en: c.en, bn: c.bn },
      numericLevel: c.numericLevel,
      academicYear: year._id,
    }))
  );

  // Section A for each class
  const sections = await Section.create(
    classes.map((cls) => ({
      name: { en: 'A', bn: 'ক' },
      class: cls._id,
      capacity: 40,
      room: `Room ${cls.numericLevel}01`,
    }))
  );

  // Subjects for Class 6
  const subjectDefs = [
    { en: 'Bangla', bn: 'বাংলা', code: 'BAN' },
    { en: 'English', bn: 'ইংরেজি', code: 'ENG' },
    { en: 'Mathematics', bn: 'গণিত', code: 'MATH' },
    { en: 'Science', bn: 'বিজ্ঞান', code: 'SCI' },
    { en: 'Religion', bn: 'ধর্ম', code: 'REL' },
  ];
  const subjects = await Subject.create(
    subjectDefs.map((s) => ({
      name: { en: s.en, bn: s.bn },
      code: s.code,
      class: classes[0]._id,
      fullMarks: 100,
      passMarks: 33,
    }))
  );

  // Teachers
  const teacher = await Teacher.create({
    employeeId: 'T-0001',
    name: { en: 'Rahim Uddin', bn: 'রহিম উদ্দিন' },
    designation: { en: 'Senior Teacher', bn: 'সিনিয়র শিক্ষক' },
    gender: 'male',
    phone: '01700000001',
    email: 'rahim@school.test',
    subjects: [subjects[0]._id, subjects[2]._id],
  });
  await Section.findByIdAndUpdate(sections[0]._id, { classTeacher: teacher._id });

  // Students
  const students = await Student.create([
    {
      admissionNo: 'A-1001',
      roll: 1,
      name: { en: 'Karim Ahmed', bn: 'করিম আহমেদ' },
      gender: 'male',
      class: classes[0]._id,
      section: sections[0]._id,
      academicYear: year._id,
      guardians: [
        { name: { en: 'Jalal Ahmed', bn: 'জালাল আহমেদ' }, relation: { en: 'Father', bn: 'পিতা' }, phone: '01800000001' },
      ],
    },
    {
      admissionNo: 'A-1002',
      roll: 2,
      name: { en: 'Sadia Islam', bn: 'সাদিয়া ইসলাম' },
      gender: 'female',
      class: classes[0]._id,
      section: sections[0]._id,
      academicYear: year._id,
      guardians: [
        { name: { en: 'Nurul Islam', bn: 'নুরুল ইসলাম' }, relation: { en: 'Father', bn: 'পিতা' }, phone: '01800000002' },
      ],
    },
  ]);

  // Fee structure
  await FeeStructure.create({
    name: { en: 'Monthly Tuition', bn: 'মাসিক বেতন' },
    amount: 800,
    frequency: 'monthly',
    academicYear: year._id,
  });

  // Notice
  await Notice.create({
    title: { en: 'Welcome to the new session', bn: 'নতুন শিক্ষাবর্ষে স্বাগতম' },
    body: {
      en: 'Classes for the 2026 session begin on January 1st.',
      bn: '২০২৬ শিক্ষাবর্ষের ক্লাস ১লা জানুয়ারি থেকে শুরু হবে।',
    },
    audience: ['all'],
    isPinned: true,
  });

  // Users (one per role). Passwords are set via helper so they are hashed.
  const userDefs = [
    { name: { en: 'System Admin', bn: 'সিস্টেম অ্যাডমিন' }, email: 'admin@school.test', role: 'admin', password: 'admin1234', phone: '01700000000' },
    { name: teacher.name, email: 'teacher@school.test', role: 'teacher', password: 'teacher1234', teacher: teacher._id, phone: '01700000001' },
    { name: students[0].name, email: 'student@school.test', role: 'student', password: 'student1234', student: students[0]._id, phone: '01800000001' },
    { name: { en: 'Jalal Ahmed', bn: 'জালাল আহমেদ' }, email: 'parent@school.test', role: 'parent', password: 'parent1234', children: [students[0]._id], phone: '01800000002' },
    { name: { en: 'Office Accountant', bn: 'অফিস হিসাবরক্ষক' }, email: 'accountant@school.test', role: 'accountant', password: 'account1234', phone: '01700000002' },
  ];
  for (const u of userDefs) {
    const { password, ...rest } = u;
    const user = new User(rest);
    await user.setPassword(password);
    await user.save();
  }

  // eslint-disable-next-line no-console
  console.log('[seed] Done. Demo logins:');
  // eslint-disable-next-line no-console
  console.log('  admin@school.test / admin1234');
  console.log('  teacher@school.test / teacher1234');
  console.log('  student@school.test / student1234');
  console.log('  parent@school.test / parent1234');
  console.log('  accountant@school.test / account1234');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] Failed:', err);
  process.exit(1);
});
