import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  phone: { type: String, required: true, trim: true, maxlength: 50 },
  address: { type: String, required: true, trim: true, maxlength: 1000 },
  email: { type: String, trim: true, default: '', maxlength: 254 },
}, baseSchemaOptions);

const depositSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  amountCents: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  date: { type: Date, required: true },
  note: { type: String, trim: true, maxlength: 1000, default: '' },
  requestKey: { type: String, required: true, unique: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isReversed: { type: Boolean, default: false },
  reversalCorrection: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialCorrection' },
}, baseSchemaOptions);
depositSchema.index({ partner: 1, date: -1, createdAt: -1 });
export const Partner = mongoose.model('Partner', partnerSchema);
export const PartnerDeposit = mongoose.model('PartnerDeposit', depositSchema);
