import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';

export const FinancialCorrection = mongoose.model('FinancialCorrection', new mongoose.Schema({
  targetType: { type: String, required: true, enum: ['income', 'expense', 'salary', 'partnerDeposit', 'profitPayment'], index: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  operation: { type: String, enum: ['reverse', 'replace'], required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  beforeHash: { type: String, required: true },
  proposed: { type: mongoose.Schema.Types.Mixed },
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  activeTargetKey: { type: String, unique: true, sparse: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, default: '' },
  effectiveAt: Date,
  replacementId: mongoose.Schema.Types.ObjectId,
}, baseSchemaOptions));
FinancialCorrection.schema.index({ status: 1, createdAt: -1 });
export const FinancialLock = mongoose.model('FinancialLock', new mongoose.Schema({ _id: String, revision: { type: Number, default: 0 } }));
