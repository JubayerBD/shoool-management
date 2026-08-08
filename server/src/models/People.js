import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

const guardianSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    relation: { type: bilingual() }, // Father / Mother / Guardian
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    occupation: { type: bilingual() },
  },
  { _id: false }
);

const studentSchema = new Schema(
  {
    admissionNo: { type: String, required: true, unique: true, trim: true, index: true },
    roll: { type: Number },
    name: { type: bilingual({ requiredEn: true }), required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
    dateOfBirth: { type: Date },
    bloodGroup: { type: String, trim: true, default: '' },
    photoUrl: { type: String, trim: true, default: '' },
    address: { type: bilingual() },
    class: { type: Schema.Types.ObjectId, ref: 'Class', index: true },
    section: { type: Schema.Types.ObjectId, ref: 'Section', index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    guardians: [guardianSchema],
    admissionDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'graduated'], default: 'active' },
  },
  baseSchemaOptions
);

const teacherSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: bilingual({ requiredEn: true }), required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
    designation: { type: bilingual() },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    photoUrl: { type: String, trim: true, default: '' },
    address: { type: bilingual() },
    subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  baseSchemaOptions
);

export const Student = mongoose.model('Student', studentSchema);
export const Teacher = mongoose.model('Teacher', teacherSchema);
