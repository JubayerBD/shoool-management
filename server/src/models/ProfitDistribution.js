import mongoose from 'mongoose';
import { baseSchemaOptions } from './common.js';

const distributionSchema = new mongoose.Schema({
  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  requestKey: { type: String, required: true, unique: true },
  previewHash: { type: String, required: true },
  report: { type: mongoose.Schema.Types.Mixed, required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, baseSchemaOptions);

export const ProfitDistribution = mongoose.model('ProfitDistribution', distributionSchema);
export const ProfitDistributionLock = mongoose.model('ProfitDistributionLock', new mongoose.Schema({ _id: String, version: { type: Number, default: 0 } }));
