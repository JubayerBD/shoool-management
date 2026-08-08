import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import ExamTerms from './ExamTerms.jsx';
import MarkEntry from './MarkEntry.jsx';
import ReportCard from './ReportCard.jsx';
import ResultSheet from './ResultSheet.jsx';

export default function Exams() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Students/parents only see report cards; staff get all tabs.
  const isStaff = ['admin', 'teacher'].includes(user.role);
  const tabs = [
    ...(isStaff
      ? [
          { key: 'terms', label: t('exams.tabs.terms'), el: <ExamTerms /> },
          { key: 'marks', label: t('exams.tabs.marks'), el: <MarkEntry /> },
          { key: 'resultSheet', label: t('exams.tabs.resultSheet'), el: <ResultSheet /> },
        ]
      : []),
    { key: 'reportCard', label: t('exams.tabs.reportCard'), el: <ReportCard /> },
  ];

  const [active, setActive] = useState(tabs[0].key);
  const activeTab = tabs.find((x) => x.key === active) || tabs[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{t('exams.title')}</h1>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active === tab.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab.el}
    </div>
  );
}
