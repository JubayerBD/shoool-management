import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import BilingualInput from '../../components/ui/BilingualInput.jsx';
import BackupsPanel from './BackupsPanel.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function FinanceSettings() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const { user } = useAuth();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [income, setIncome] = useState([]);
  const [expense, setExpense] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(null); // { type, editing? }
  const [name, setName] = useState({ en: '', bn: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, exp] = await Promise.all([
        api.get('/finance/categories', { params: { type: 'income' } }),
        api.get('/finance/categories', { params: { type: 'expense' } }),
      ]);
      setIncome(inc.data.items);
      setExpense(exp.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = (type) => {
    setModal({ type });
    setName({ en: '', bn: '' });
  };
  const openEdit = (type, cat) => {
    setModal({ type, editing: cat });
    setName({ en: cat.name?.en || '', bn: cat.name?.bn || '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.editing) {
        await api.put(`/finance/categories/${modal.editing.id || modal.editing._id}`, { name });
      } else {
        await api.post('/finance/categories', { type: modal.type, name });
      }
      setModal(null);
      push(t('finance.saved'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/finance/categories/${deleteId}`);
      push(t('finance.deleted'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const Column = ({ type, title, list }) => (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={() => openAdd(type)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + {t('finance.categories.add')}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">{t('finance.categories.none')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((c) => (
            <li key={c.id || c._id} className="flex items-center justify-between py-2.5">
              <span className="text-sm font-medium text-slate-800">{bt(c.name, lang)}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(type, c)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(c.id || c._id)}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {user.role === 'admin' && <BackupsPanel />}
      {loading ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Column type="income" title={t('finance.categories.incomeHeads')} list={income} />
          <Column type="expense" title={t('finance.categories.expenseHeads')} list={expense} />
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        size="md"
        title={modal?.editing ? t('finance.categories.edit') : t('finance.categories.add')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="cat-form"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <form id="cat-form" onSubmit={submit}>
          <BilingualInput
            labelEn={t('finance.categories.nameEn')}
            labelBn={t('finance.categories.nameBn')}
            value={name}
            onChange={setName}
            requiredEn
          />
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
