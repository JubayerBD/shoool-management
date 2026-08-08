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
    grade: { type: String, trim: true, default: '' }, // A+, A, ...
    gradePoint: { type: Number, default: 0 }, // 5.00, 4.00, ...
    remark: { type: String, trim: true, default: '' },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

// One mark per student per subject per exam.
markSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });

export const Exam = mongoose.model('Exam', examSchema);
export const Mark = mongoose.model('Mark', markSchema);
