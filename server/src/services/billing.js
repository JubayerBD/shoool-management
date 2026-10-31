import mongoose from 'mongoose';
import { Invoice } from '../models/Fees.js';
import { ApiError } from '../utils/ApiError.js';

const counterSchema = new mongoose.Schema({ _id: String, value: { type: Number, default: 0 } });
const Counter = mongoose.model('BillingCounter', counterSchema);

export async function nextInvoiceNo() {
  // Initialize against the highest legacy number, not the number of surviving invoices.
  const [latest] = await Invoice.aggregate([
    { $match: { invoiceNo: /^INV-\d+$/ } },
    { $project: { value: { $convert: { input: { $substrBytes: ['$invoiceNo', 4, -1] }, to: 'long', onError: 0 } } } },
    { $sort: { value: -1 } }, { $limit: 1 },
  ]);
  try {
    await Counter.updateOne({ _id: 'invoice' }, { $max: { value: latest?.value || 0 } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  const counter = await Counter.findOneAndUpdate({ _id: 'invoice' }, { $inc: { value: 1 } }, { new: true });
  return `INV-${String(counter.value).padStart(6, '0')}`;
}

export async function createInvoice(body, session) {
  const grossAmount = Math.round(body.items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const discountAmount = body.discountAmount || 0;
  if (discountAmount < 0 || discountAmount > grossAmount) throw ApiError.badRequest('Invalid invoice concession');
  const totalAmount = Math.round((grossAmount - discountAmount) * 100) / 100;
  const invoice = new Invoice({ ...body, invoiceNo: await nextInvoiceNo(), grossAmount, discountAmount, totalAmount, paidAmount: 0,
    status: totalAmount === 0 ? 'paid' : 'unpaid' });
  return invoice.save({ session });
}

export async function nextReceiptNo() {
  let counter;
  try {
    counter = await Counter.findOneAndUpdate({ _id: 'receipt' }, { $inc: { value: 1 } }, { upsert: true, new: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    counter = await Counter.findOneAndUpdate({ _id: 'receipt' }, { $inc: { value: 1 } }, { new: true });
  }
  return `REC-${String(counter.value).padStart(6, '0')}`;
}

export async function withBillingTransaction(callback) {
  try {
    return await mongoose.connection.transaction(callback, { readPreference: 'primary' });
  } catch (err) {
    if (err.code === 20 || /Transaction numbers are only allowed/.test(err.message)) {
      throw new ApiError(503, 'Payments require a MongoDB replica set. Use MongoDB Atlas or the bundled replica-set demo database.');
    }
    throw err;
  }
}
