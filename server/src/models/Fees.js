import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

/** A reusable fee definition, e.g. "Monthly Tuition", "Admission Fee". */
const feeStructureSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    amount: { type: Number, required: true, min: 0 },
    frequency: {
      type: String,
      enum: ['one_time', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    class: { type: Schema.Types.ObjectId, ref: 'Class' }, // null => applies to all
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    isActive: { type: Boolean, default: true },
    // Explicit opt-in prevents existing fee definitions from creating surprise bills.
    autoGenerate: { type: Boolean, default: false },
    billingStart: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  baseSchemaOptions
);

const invoiceItemSchema = new Schema(
  {
    feeStructure: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
    title: { type: bilingual({ requiredEn: true }), required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/** A bill issued to a student. */
const invoiceSchema = new Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true, index: true },
    generationKey: { type: String },
    billingSchedule: { type: Schema.Types.ObjectId, ref: 'BillingSchedule', index: true },
    billingDate: { type: String },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    items: [invoiceItemSchema],
    // Period this invoice covers, e.g. month label. Bilingual for display.
    period: { type: bilingual() },
    totalAmount: { type: Number, required: true, min: 0 },
    grossAmount: { type: Number, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    concessionReason: { type: String, default: '' },
    waivedAmount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'cancelled'],
      default: 'unpaid',
      index: true,
    },
  },
  baseSchemaOptions
);

invoiceSchema.virtual('balance').get(function balance() {
  return this.status === 'cancelled' ? 0 : Math.max(0, (this.totalAmount || 0) - (this.waivedAmount || 0) - (this.paidAmount || 0));
});
invoiceSchema.index({ generationKey: 1 }, { unique: true, sparse: true });

/** A payment recorded against an invoice. */
const paymentSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    idempotencyKey: { type: String },
    receiptNo: { type: String, unique: true, sparse: true },
    refundedAmount: { type: Number, default: 0, min: 0 },
    originalAmount: { type: Number, min: 0 },
    corrections: [{ _id: false, previousAmount: Number, correctedAmount: Number, reason: String,
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User' }, approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, approvedAt: Date }],
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'],
      default: 'cash',
    },
    transactionRef: { type: String, trim: true, default: '' },
    paidAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, default: '' },
  },
  baseSchemaOptions
);

export const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);
paymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
