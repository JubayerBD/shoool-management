import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

/** An exam term, e.g. "Half Yearly", "Final". */
const examSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    startDate: { type: Date },
    endDate: { type: Date },
    isPublished: { type: Boolean, default: false }, // results visible to students/parents
  },
  baseSchemaOptions
);

/** A single subject mark for a student in an exam. */
const markSchema = new Schema(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    marksObtained: { type: Number, required: true, min: 0 },
    fullMarks: { type: Number, default: 100 },
    // Pass mark that applied when this mark was graded (empty on marks saved before pass marks were used).
    passMarks: { type: Number, min: 0 },
    // Class the mark was entered for: subjects can be shared by several classes.
    class: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    grade: { type: String, trim: true, default: '' }, // A+, A, ...
    gradePoint: { type: Number, default: 0 }, // 5.00, 4.00, ...
    remark: { type: String, trim: true, default: '' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

// One mark per student per subject per exam.
markSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });

/**
 * Full and pass marks of one subject in one exam term for one class, e.g.
 * 1st Tutorial · Class 6 · Bangla = 30 / 10 while Annual · Class 6 · Bangla = 40 / 13.
 */
const examPaperSchema = new Schema(
  {
    exam: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    fullMarks: { type: Number, required: true, min: 1 },
    passMarks: { type: Number, required: true, min: 0 },
  },
  baseSchemaOptions
);
examPaperSchema.index({ exam: 1, class: 1, subject: 1 }, { unique: true });

export const Exam = mongoose.model('Exam', examSchema);
export const ExamPaper = mongoose.model('ExamPaper', examPaperSchema);
export const Mark = mongoose.model('Mark', markSchema);
