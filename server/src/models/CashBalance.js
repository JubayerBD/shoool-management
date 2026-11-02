import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';
import { FINANCE_METHODS } from './Finance.js';

// One immutable starting balance; later activity is always derived from records.
export const OpeningBalance = mongoose.model('OpeningBalance', new mongoose.Schema({
  key: { type: String, required: true, unique: true, enum: ['opening'] },
  amountCents: { type: Number, required: true, validate: Number.isSafeInteger },
  date: { type: Date, required: true },
  note: { type: String, required: true, maxlength: 1000 },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, baseSchemaOptions));

export const ProfitPayment = mongoose.model('ProfitPayment', new mongoose.Schema({
  distribution: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfitDistribution', required: true, index: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  amountCents: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  date: { type: Date, required: true, index: true },
  method: { type: String, enum: FINANCE_METHODS, required: true },
  reference: { type: String, trim: true, maxlength: 200, default: '' },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  requestKey: { type: String, required: true, unique: true },
  isReversed: { type: Boolean, default: false },
  reversalCorrection: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialCorrection' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, baseSchemaOptions));
