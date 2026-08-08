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
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    items: [invoiceItemSchema],
    // Period this invoice covers, e.g. month label. Bilingual for display.
    period: { type: bilingual() },
    totalAmount: { type: Number, required: true, min: 0 },
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
  return Math.max(0, (this.totalAmount || 0) - (this.paidAmount || 0));
});

/** A payment recorded against an invoice. */
const paymentSchema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
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
export const Invoice = mongoose.model('Invoice', invoiceSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
