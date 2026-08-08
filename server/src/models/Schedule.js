import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

/** A single period in a section's weekly routine. */
const timetableSlotSchema = new Schema(
  {
    section: { type: Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    // 0 = Sunday ... 6 = Saturday (BD week typically starts Sunday).
    dayOfWeek: { type: Number, min: 0, max: 6, required: true, index: true },
    startTime: { type: String, required: true }, // "09:00"
    endTime: { type: String, required: true }, // "09:45"
    room: { type: String, trim: true, default: '' },
  },
  baseSchemaOptions
);

/** A notice / announcement on the board. */
const noticeSchema = new Schema(
  {
    title: { type: bilingual({ requiredEn: true }), required: true },
    body: { type: bilingual() },
    // Which roles this notice is targeted at; empty => everyone.
    audience: [{ type: String, enum: ['all', 'teacher', 'student', 'parent', 'accountant'] }],
    publishedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date },
    isPinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

export const TimetableSlot = mongoose.model('TimetableSlot', timetableSlotSchema);
export const Notice = mongoose.model('Notice', noticeSchema);
