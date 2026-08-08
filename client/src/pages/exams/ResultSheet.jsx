import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from '../../components/ui/Toast.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';
import BatchReportCards from './BatchReportCards.jsx';

export default function ResultSheet() {
  const { t, i18n } = useTranslation();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [exams, setExams] = useState([]);
  const [sections, setSections] = useState([]);
  const [exam, setExam] = useState('');
  const [section, setSection] = useState('');
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  useEffect(() => {
    api.get('/exams/exams', { params: { limit: 200 } }).then((r) => setExams(r.data.items));
    api.get('/academics/sections', { params: { limit: 500 } }).then((r) => setSections(r.data.items));
  }, []);

  const examName = useMemo(() => {
    const e = exams.find((x) => (x.id || x._id) === exam);
    return e ? bt(e.name, lang) : '';
  }, [exams, exam, lang]);
  const sectionName = useMemo(() => {
    const s = sections.find((x) => (x.id || x._id) === section);
    return s ? `${bt(s.class?.name, lang)} — ${bt(s.name, lang)}` : '';
  }, [sections, section, lang]);

  const view = async () => {
    if (!exam || !section) return;
    setLoading(true);
    setSheet(null);
    try {
      const res = await api.get('/exams/tabulation', { params: { exam, section } });
      setSheet(res.data);
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm no-print">
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('exams.tabs.terms')}</label>
          <Select value={exam} onChange={(e) => setExam(e.target.value)}>
            <option value="">{t('exams.selectExam')}</option>
            {exams.map((x) => (
              <option key={x.id || x._id} value={x.id || x._id}>
                {bt(x.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('students.section')}</label>
          <Select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">{t('exams.selectSection')}</option>
            {sections.map((s) => (
              <option key={s.id || s._id} value={s.id || s._id}>
                {bt(s.class?.name, lang)} — {bt(s.name, lang)}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={view}
          disabled={!exam || !section || loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('exams.view')}
        </button>
        {sheet && (
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              🖨 {t('common.print')}
            </button>
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('exams.printAllCards')}
            </button>
          </>
        )}
      </div>

      <BatchReportCards
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        exam={exam}
        section={section}
        examName={examName}
      />

      {sheet && (
        <div className="overflow-x-auto rounded-xl bg-white p-5 shadow-sm print-area">
          <div className="mb-4 text-center">
            <div className="text-xl font-bold text-slate-800">{t('app.name')}</div>
            <div className="text-sm text-slate-500">
              {examName} · {sectionName}
            </div>
          </div>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('exams.roll')}</th>
                <th className="px-3 py-2">{t('attendance.name')}</th>
                {sheet.subjects.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-center">
                    {bt(s.name, lang)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t('exams.total')}</th>
                <th className="px-3 py-2 text-right">{t('exams.gpa')}</th>
                <th className="px-3 py-2 text-center">{t('exams.result')}</th>
                <th className="px-3 py-2 text-center">{t('exams.rank')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheet.rows.map((row) => (
                <tr key={row.student.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-500">{row.student.roll ?? '—'}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{bt(row.student.name, lang)}</td>
                  {row.perSubject.map((m, i) => (
                    <td key={i} className="px-3 py-2 text-center">
                      {m.marksObtained ?? '—'}
                      {m.grade === 'F' && <span className="ml-0.5 text-xs text-red-500">F</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold">{row.totalObtained}</td>
                  <td className="px-3 py-2 text-right">{row.gpa.toFixed(2)}</td>
                  <td
                    className={`px-3 py-2 text-center text-xs font-semibold ${
                      row.result === 'Pass'
                        ? 'text-emerald-600'
                        : row.result === 'Fail'
                        ? 'text-red-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {row.result === 'Pass'
                      ? t('exams.pass')
                      : row.result === 'Fail'
                      ? t('exams.fail')
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-medium">{row.rank ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
