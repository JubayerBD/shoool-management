import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';

// One student may attend more than one class/program in the same academic year.
// Keep these records when the student's current class changes in a later year.
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  roll: { type: Number },
  isPrimary: { type: Boolean, default: true },
  status: { type: String, enum: ['enrolled', 'promoted', 'repeated', 'withdrawn', 'completed'], default: 'enrolled' },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
}, baseSchemaOptions);
enrollmentSchema.index({ student: 1, academicYear: 1, class: 1 }, { unique: true });
export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
