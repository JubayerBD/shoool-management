import { ApiError } from './ApiError.js';

export function studentScope(user, requested) {
  if (['admin', 'accountant'].includes(user.role)) return requested ? { student: requested } : {};
  const ids = user.role === 'student' ? [user.student].filter(Boolean)
    : user.role === 'parent' ? (user.children || []) : [];
  if (!['student', 'parent'].includes(user.role)) throw ApiError.forbidden();
  if (requested && !ids.some((id) => String(id) === String(requested))) throw ApiError.forbidden();
  return { student: requested || { $in: ids } };
}

export const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
export const amountDue = (invoice) => invoice.status === 'cancelled' ? 0
  : money(Math.max(0, invoice.totalAmount - (invoice.waivedAmount || 0) - invoice.paidAmount));
export function updateInvoiceStatus(invoice) {
  if (invoice.status === 'cancelled') return;
  invoice.status = amountDue(invoice) <= 0 ? 'paid' : invoice.paidAmount > 0 ? 'partial' : 'unpaid';
}
