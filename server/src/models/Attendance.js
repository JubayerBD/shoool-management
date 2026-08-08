import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

const attendanceSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    section: { type: Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      default: 'present',
    },
    remark: { type: String, trim: true, default: '' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

// One attendance record per student per day.
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
