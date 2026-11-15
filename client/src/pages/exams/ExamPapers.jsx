import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import { apiError } from '../../utils/apiError.js';

const idOf = (item) => String(item?.id || item?._id || item || '');
const inputClass = 'w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-right outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

/**
 * Full and pass marks of every subject of one class in one exam term. Saving re-grades
 * marks that were already entered, so results always follow this setup.
 */
export default function ExamPapers({ open, onClose, exam, classes, initialClass = '', onSaved }) {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [klass, setKlass] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const yearId = idOf(exam?.academicYear);
  const classOptions = classes.filter((item) => !yearId || !item.academicYear || idOf(item.academicYear) === yearId);

  useEffect(() => { if (open) { setKlass(initialClass); setError(''); } }, [open, initialClass]);
  useEffect(() => {
    if (!open || !exam || !klass) { setRows([]); return undefined; }
    let current = true;
    setLoading(true); setError('');
    api.get('/exams/papers', { params: { exam: idOf(exam), class: klass } })
      .then((res) => { if (current) setRows(res.data.items.map((row) => ({ ...row, fullMarks: String(row.fullMarks), passMarks: String(row.passMarks) }))); })
      .catch((err) => { if (current) setError(apiError(err)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, exam, klass]);

  const set = (subject, key, value) => setRows((list) => list.map((row) => (row.subject === subject ? { ...row, [key]: value } : row)));
  // 33% of full marks, the usual rule: 30 -> 10, 40 -> 13, 100 -> 33.
  const fillPassMarks = () => setRows((list) => list.map((row) => (Number(row.fullMarks) > 0 ? { ...row, passMarks: String(Math.round(Number(row.fullMarks) * 0.33)) } : row)));

  const problem = rows.find((row) => !(Number(row.fullMarks) >= 1) || row.passMarks === '' || Number(row.passMarks) < 0 || Number(row.passMarks) > Number(row.fullMarks));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await api.put('/exams/papers', {
        exam: idOf(exam), class: klass,
        papers: rows.map((row) => ({ subject: row.subject, fullMarks: Number(row.fullMarks), passMarks: Number(row.passMarks) })),
      });
      push(res.data.regraded ? t('exams.papersSavedRegraded', { count: res.data.regraded }) : t('exams.papersSaved'));
      onSaved?.(klass);
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title={`${t('exams.subjectMarks')} — ${bt(exam?.name, lang)}`}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('common.cancel')}</button>
          <button type="button" onClick={save} disabled={saving || loading || !klass || !rows.length || !!problem} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{t('exams.papersHint')}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-60">
            <label htmlFor="papers-class" className="mb-1 block text-sm font-medium text-slate-700">{t('academics.class')}</label>
            <Select id="papers-class" value={klass} onChange={(e) => setKlass(e.target.value)} disabled={saving}>
              <option value="">{t('attendance.selectClass')}</option>
              {classOptions.map((item) => <option key={idOf(item)} value={idOf(item)}>{bt(item.name, lang)}</option>)}
            </Select>
          </div>
          {rows.length > 0 && (
            <button type="button" onClick={fillPassMarks} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('exams.fillPassMarks')}</button>
          )}
        </div>
        {error && <div role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}
        {!klass ? null : loading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">{t('exams.noSubjects')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">{t('exams.subject')}</th>
                  <th className="px-4 py-2 text-right">{t('exams.fullMarks')}</th>
                  <th className="px-4 py-2 text-right">{t('exams.passMarks')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const bad = row.passMarks !== '' && Number(row.passMarks) > Number(row.fullMarks);
                  return (
                    <tr key={row.subject}>
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {bt(row.name, lang)}
                        {!row.configured && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-700">{t('exams.notSetYet')}</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min="1" step="any" aria-label={`${t('exams.fullMarks')} ${bt(row.name, lang)}`} value={row.fullMarks} onChange={(e) => set(row.subject, 'fullMarks', e.target.value)} className={inputClass} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min="0" step="any" aria-label={`${t('exams.passMarks')} ${bt(row.name, lang)}`} value={row.passMarks} onChange={(e) => set(row.subject, 'passMarks', e.target.value)} className={`${inputClass} ${bad ? 'border-red-400 bg-red-50' : ''}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {problem && rows.length > 0 && <p className="text-sm text-red-600">{t('exams.papersInvalid')}</p>}
      </div>
    </Modal>
  );
}
