import mongoose from 'mongoose';
import { baseSchemaOptions, bilingual } from './common.js';

const activitySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  actorName: { type: bilingual(), default: () => ({}) },
  actorEmail: { type: String, default: '', maxlength: 254 },
  actorRole: { type: String, default: '' },
  attemptedEmail: { type: String, default: '', maxlength: 254 },
  action: { type: String, required: true, index: true },
  module: { type: String, required: true, index: true },
  resource: { type: String, required: true },
  recordId: { type: String, default: '', index: true },
  method: { type: String, required: true },
  route: { type: String, required: true },
  status: { type: Number, required: true },
  outcome: { type: String, enum: ['success', 'failed'], required: true, index: true },
  changedFields: [String],
  details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { ...baseSchemaOptions, timestamps: { createdAt: true, updatedAt: false } });
activitySchema.index({ createdAt: -1, _id: -1 });
// No application endpoint exposes modifications or deletion of activity records.
export const ActivityLog = mongoose.model('ActivityLog', activitySchema);
