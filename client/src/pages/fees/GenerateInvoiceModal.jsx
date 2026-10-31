import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import StudentPicker from '../../components/ui/StudentPicker.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';

const thisMonth = () => new Date().toISOString().slice(0, 7);
// "2026-11" -> "November 2026"
const monthLabel = (m) => (m ? new Date(m + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' }) : '');

/**
 * Generate an invoice for a student from a fee structure.
 * Flow: pick class -> searchable student -> month.
 */
export default function GenerateInvoiceModal({ structure, onClose, onCreated }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const taka = t('common.taka');

  const structClassId = structure?.class?.id || structure?.class?._id || structure?.class || '';

  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState('');
  const [month, setMonth] = useState(thisMonth());
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset + load classes when opened; default the class filter to the structure's class.
  useEffect(() => {
    if (!structure) return;
    setStudent('');
    setMonth(thisMonth());
    setDueDate('');
    setClassId(structClassId || '');
    api.get('/academics/classes', { params: { limit: 200 } }).then((r) => setClasses(r.data.items));
  }, [structure, structClassId]);

  // Load students for the selected class (or all).
  useEffect(() => {
    if (!structure) return;
    setStudent('');
    const params = { limit: 1000 };
    if (classId) params.class = classId;
    api.get('/people/students', { params }).then((r) => setStudents(r.data.items));
  }, [structure, classId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!structure || !student) return;
    setSaving(true);
    try {
      const res = await api.post('/fees/invoices', {
        student,
        period: { en: monthLabel(month), bn: '' },
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

          <Field label={t('fees.class')}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('fees.allClasses')}</option>
              {classes.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {bt(c.name, lang)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('fees.student')} required>
            <StudentPicker students={students} value={student} onChange={setStudent} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('fees.month')}>
              <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
