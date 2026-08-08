import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';
import { t as bt } from '../../utils/bilingual.js';

const gradeColor = (g) => {
  if (g === 'F') return 'text-red-600';
  if (g === 'A+' || g === 'A') return 'text-emerald-600';
  return 'text-slate-700';
};

function OneCard({ card, examName, schoolName, lang, t }) {
  return (
    <div className="page-break mb-8 border-b border-dashed border-slate-300 pb-8 last:mb-0 last:border-0">
      <div className="mb-3 text-center">
        <div className="text-xl font-bold text-slate-800">{schoolName}</div>
        <div className="text-sm text-slate-500">{t('exams.tabs.reportCard')}</div>
      </div>
      <div className="mb-2">
        <div className="text-lg font-bold text-slate-800">{bt(card.student.name, lang)}</div>
        <div className="text-sm text-slate-500">
          {examName} · {card.student.admissionNo}
        </div>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">{t('exams.subject')}</th>
            <th className="px-3 py-2 text-right">{t('exams.fullMarks')}</th>
            <th className="px-3 py-2 text-right">{t('exams.marksObtained')}</th>
            <th className="px-3 py-2 text-center">{t('exams.grade')}</th>
            <th className="px-3 py-2 text-right">{t('exams.gradePoint')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {card.subjects.map((m) => (
            <tr key={m.id || m._id}>
              <td className="px-3 py-1.5 font-medium text-slate-800">{bt(m.subject?.name, lang)}</td>
              <td className="px-3 py-1.5 text-right text-slate-500">{m.fullMarks}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{m.marksObtained}</td>
              <td className={`px-3 py-1.5 text-center font-bold ${gradeColor(m.grade)}`}>{m.grade}</td>
              <td className="px-3 py-1.5 text-right">{m.gradePoint.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-50 text-sm font-semibold">
          <tr>
            <td className="px-3 py-2">{t('exams.total')}</td>
            <td className="px-3 py-2 text-right">{card.totalFull}</td>
            <td className="px-3 py-2 text-right">{card.totalObtained}</td>
            <td colSpan={2} className="px-3 py-2 text-right">
              {card.percentage}%
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-2 flex gap-6 text-sm">
        <span>
          {t('exams.gpa')}: <b>{card.gpa.toFixed(2)}</b>
        </span>
        <span>
          {t('exams.result')}:{' '}
          <b className={card.result === 'Pass' ? 'text-emerald-700' : 'text-red-700'}>
            {card.result === 'Pass' ? t('exams.pass') : card.result === 'Fail' ? t('exams.fail') : '—'}
          </b>
        </span>
      </div>
    </div>
  );
}

export default function BatchReportCards({ open, onClose, exam, section, examName }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !exam || !section) return;
    setLoading(true);
    api
      .get('/exams/report-cards', { params: { exam, section } })
      .then((r) => setCards(r.data.cards))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [open, exam, section]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('exams.printAllCards')}
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
            type="button"
            onClick={() => window.print()}
            disabled={loading || cards.length === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            🖨 {t('common.print')}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-slate-400">{t('common.loading')}</div>
      ) : cards.length === 0 ? (
        <div className="py-8 text-center text-slate-400">{t('exams.noCards')}</div>
      ) : (
        <div className="print-area">
          {cards.map((c) => (
            <OneCard
              key={c.student.id || c.student._id}
              card={c}
              examName={examName}
              schoolName={t('app.name')}
              lang={lang}
              t={t}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
