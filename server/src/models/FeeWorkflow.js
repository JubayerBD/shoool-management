import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;
const line = new Schema({
  feeType: { type: Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
  title: { type: bilingual({ requiredEn: true }), required: true },
  amount: { type: Number, required: true, min: 0 },
  optional: { type: Boolean, default: false },
}, { _id: false });

const feePlan = new Schema({
  name: { type: bilingual({ requiredEn: true }), required: true },
  class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  items: { type: [line], required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvalRevision: { type: Number, default: 0 },
}, baseSchemaOptions);

const concession = new Schema({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  feeType: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
  mode: { type: String, enum: ['fixed', 'percent'], required: true },
  value: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
}, { _id: false });

const schedule = new Schema({
  name: { type: String, required: true, trim: true },
  plan: { type: Schema.Types.ObjectId, ref: 'FeePlan', required: true },
  feeTypes: [{ type: Schema.Types.ObjectId, ref: 'FeeStructure' }],
  class: { type: Schema.Types.ObjectId, ref: 'Class' },
  academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear' },
  items: [line], // Frozen plan/rate snapshot on approval.
  students: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  optionalAssignments: [{ _id: false, feeType: { type: Schema.Types.ObjectId, ref: 'FeeStructure' }, students: [{ type: Schema.Types.ObjectId, ref: 'Student' }] }],
  concessions: [concession],
  componentRules: [{ _id: false,
    feeType: { type: Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
    startDate: { type: String, required: true },
    intervalMonths: { type: Number, required: true, min: 0, max: 12 }, // 0 = once
  }],
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  frequency: { type: String, enum: ['one_time', 'monthly', 'quarterly', 'yearly'], required: true },
  dueDays: { type: Number, default: 9, min: 0, max: 90 },
  status: { type: String, enum: ['draft', 'active', 'paused', 'ended', 'cancelled'], default: 'draft', index: true },
  billingRevision: { type: Number, default: 0 },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: Date,
  cancellationReason: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
}, baseSchemaOptions);

const adjustment = new Schema({
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
  type: { type: String, enum: ['waiver', 'cancellation', 'refund', 'payment_correction'], required: true },
  previousAmount: Number,
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date, index: true },
  reviewNote: { type: String, default: '' },
}, baseSchemaOptions);

export const FeePlan = mongoose.model('FeePlan', feePlan);
export const BillingSchedule = mongoose.model('BillingSchedule', schedule);
export const FeeAdjustment = mongoose.model('FeeAdjustment', adjustment);
