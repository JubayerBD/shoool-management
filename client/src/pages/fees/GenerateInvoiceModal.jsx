import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';

/**
 * Generate an invoice for a student from a fee structure, then hand the new
 * invoice id back so a printable invoice can be shown.
 * @param {object|null} structure  The fee structure (null = closed).
 * @param {() => void} onClose
 * @param {(invoiceId: string) => void} onCreated
 */
export default function GenerateInvoiceModal({ structure, onClose, onCreated }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');

  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState('');
  const [periodEn, setPeriodEn] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const classId = structure?.class?.id || structure?.class?._id || structure?.class || '';

  useEffect(() => {
    if (!structure) return;
    setStudent('');
    setPeriodEn('');
    setDueDate('');
    const params = { limit: 500 };
    if (classId) params.class = classId;
    api.get('/people/students', { params }).then((r) => setStudents(r.data.items));
  }, [structure, classId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!structure) return;
    setSaving(true);
    try {
      const res = await api.post('/fees/invoices', {
        student,
        period: { en: periodEn, bn: '' },
        ...(dueDate ? { dueDate } : {}),
        items: [
          {
            feeStructure: structure.id || structure._id,
            title: { en: structure.name?.en || '', bn: structure.name?.bn || '' },
            amount: structure.amount,
          },
        ],
      });
      push(t('fees.invoiceCreated'));
      onCreated(res.data.item.id || res.data.item._id);
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!structure}
      onClose={onClose}
      size="md"
      title={t('fees.generate')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="gen-invoice-form"
            disabled={saving || !student}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('fees.generate')}
          </button>
        </>
      }
    >
      {structure && (
        <form id="gen-invoice-form" onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm">
            <span className="text-slate-500">{bt(structure.name, lang)} — </span>
            <span className="font-semibold text-slate-800">
              {taka}
              {Number(structure.amount).toLocaleString()}
            </span>
          </div>
          <Field label={t('fees.student')} required>
            <Select value={student} onChange={(e) => setStudent(e.target.value)} required>
              <option value="">{t('fees.selectStudent')}</option>
              {students.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.name, lang)} ({s.admissionNo})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('fees.periodEn')}>
              <TextInput value={periodEn} onChange={(e) => setPeriodEn(e.target.value)} placeholder="August 2026" />
            </Field>
            <Field label={t('fees.dueDate')}>
              <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        </form>
      )}
    </Modal>
  );
}
