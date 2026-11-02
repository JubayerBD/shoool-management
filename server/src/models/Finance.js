import mongoose from 'mongoose';
import { bilingual, baseSchemaOptions } from './common.js';

const { Schema } = mongoose;

const METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'];

/** A configurable income or expense head/category (bilingual name). */
const financeCategorySchema = new Schema(
  {
    type: { type: String, enum: ['income', 'expense'], required: true, index: true },
    name: { type: bilingual({ requiredEn: true }), required: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

/** A non-fee income entry (donations, rent, grants, misc, etc.). */
const incomeSchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: 'FinanceCategory', index: true },
    source: { type: String, trim: true, default: '' }, // payer / donor / description
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now, index: true },
    method: { type: String, enum: METHODS, default: 'cash' },
    reference: { type: String, trim: true, default: '' }, // txn id / cheque no
    note: { type: String, trim: true, default: '' },
    receiptUrl: { type: String, trim: true, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

/** An expense entry. */
const expenseSchema = new Schema(
  {
    generationKey: { type: String },
    recurringSource: { type: Schema.Types.ObjectId, ref: 'Expense' },
    category: { type: Schema.Types.ObjectId, ref: 'FinanceCategory', index: true },
    payee: { type: String, trim: true, default: '' }, // vendor / person paid
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now, index: true },
    method: { type: String, enum: METHODS, default: 'cash' },
    reference: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    receiptUrl: { type: String, trim: true, default: '' },
    recurring: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

/** Optional default salary structure per staff member. */
expenseSchema.index({ generationKey: 1 }, { unique: true, sparse: true });
const salaryStructureSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, unique: true, index: true },
    basic: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions
);

/** A monthly salary payment to a staff member (also counts as an expense). */
const salaryPaymentSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    month: { type: String, required: true }, // "YYYY-MM"
    basic: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    net: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, required: true, default: Date.now, index: true },
    method: { type: String, enum: METHODS, default: 'cash' },
    note: { type: String, trim: true, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseSchemaOptions
);

// One salary payment per staff per month.
salaryPaymentSchema.index({ staff: 1, month: 1 }, { name: 'active_salary_month', unique: true, partialFilterExpression: { isReversed: false } });

for (const schema of [incomeSchema, expenseSchema, salaryPaymentSchema]) schema.add({
  isReversed: { type: Boolean, default: false },
  reversalCorrection: { type: Schema.Types.ObjectId, ref: 'FinancialCorrection' },
  sourceCorrection: { type: Schema.Types.ObjectId, ref: 'FinancialCorrection' },
});
for (const schema of [incomeSchema, expenseSchema]) {
  schema.add({ requestKey: String, requestHash: String, duplicateAcknowledged: { type: Boolean, default: false } });
  schema.index({ requestKey: 1 }, { unique: true, sparse: true });
}

export const FinanceCategory = mongoose.model('FinanceCategory', financeCategorySchema);
export const Income = mongoose.model('Income', incomeSchema);
export const Expense = mongoose.model('Expense', expenseSchema);
export const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
export const SalaryPayment = mongoose.model('SalaryPayment', salaryPaymentSchema);
export const FINANCE_METHODS = METHODS;
