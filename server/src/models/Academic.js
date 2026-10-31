import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

/** Academic year / session, e.g. "2026" or "2026-2027". */
const academicYearSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
      validate: {
        // On updates `this` is a query without startDate, so only compare when both are known.
        validator(value) { return !this.startDate || !(this.startDate instanceof Date) || value > this.startDate; },
        message: 'End date must be after the start date',
      },
    },
    isCurrent: { type: Boolean, default: false, index: true },
  },
  baseSchemaOptions
);

/** A class / grade, e.g. "Class 6". */
const classSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    numericLevel: { type: Number }, // for sorting: 6, 7, 8 ...
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
  },
  baseSchemaOptions
);

/** A section within a class, e.g. "A". */
const sectionSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classTeacher: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    capacity: { type: Number, default: 60, min: [1, 'Capacity must be at least 1'] },
    room: { type: String, trim: true, default: '' },
  },
  baseSchemaOptions
);

/** A subject, optionally tied to a class. */
const subjectSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    code: { type: String, trim: true, uppercase: true, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    fullMarks: { type: Number, default: 100, min: [1, 'Full marks must be at least 1'] },
    passMarks: {
      type: Number,
      default: 33,
      min: [0, 'Pass marks cannot be negative'],
      validate: {
        validator(value) { return typeof this.fullMarks !== 'number' || value <= this.fullMarks; },
        message: 'Pass marks cannot exceed full marks',
      },
    },
    isOptional: { type: Boolean, default: false },
  },
  baseSchemaOptions
);

export const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
export const Class = mongoose.model('Class', classSchema);
export const Section = mongoose.model('Section', sectionSchema);
export const Subject = mongoose.model('Subject', subjectSchema);
