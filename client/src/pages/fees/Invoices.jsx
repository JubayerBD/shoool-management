import { getAll } from '../../api/getAll.js';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../../components/ui/DataTable.jsx';
import { Select } from '../../components/ui/Field.jsx';
import InvoiceForm from './InvoiceForm.jsx';
import InvoiceDetail from './InvoiceDetail.jsx';
import { due } from './FeeUI.jsx';

const statusBadge = {
  unpaid: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function Invoices() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const canManage = ['admin', 'accountant'].includes(user.role);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const taka = t('common.taka');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      const res = await getAll('/fees/invoices', { params });
      setRows(res.data.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      await api.post('/fees/invoices', payload);
      setFormOpen(false);
      push(t('fees.invoiceCreated'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'invoiceNo', header: t('fees.invoiceNo') },
    {
      key: 'student',
      header: t('fees.student'),
      render: (r) => bt(r.student?.name, lang),
    },
    { key: 'period', header: t('fees.period'), render: (r) => bt(r.period, lang) || '—' },
    {
      key: 'totalAmount',
      header: t('fees.total'),
      render: (r) => `${taka}${Number(r.totalAmount).toLocaleString()}`,
    },
    {
      key: 'balance',
      header: t('fees.balance'),
      render: (r) => {
        const b = due(r);
        return (
          <span className={b > 0 ? 'font-medium text-red-600' : 'text-slate-400'}>
            {taka}
            {b.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('fees.status'),
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[r.status] || ''}`}>
          {t(`fees.statusValues.${r.status}`)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (r) => (
        <button
          type="button"
          onClick={() => setDetailId(r.id || r._id)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {t('fees.view')}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('fees.allStatuses')}</option>
            <option value="unpaid">{t('fees.statusValues.unpaid')}</option>
            <option value="partial">{t('fees.statusValues.partial')}</option>
            <option value="paid">{t('fees.statusValues.paid')}</option>
          </Select>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + {t('fees.newInvoice')}
          </button>
        )}
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      {canManage && (
        <InvoiceForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSubmit={handleCreate}
          saving={saving}
        />
      )}

      <InvoiceDetail
        open={!!detailId}
        invoiceId={detailId}
        onClose={() => setDetailId(null)}
        canPay={canManage}
        onChanged={load}
      />
    </div>
  );
}
