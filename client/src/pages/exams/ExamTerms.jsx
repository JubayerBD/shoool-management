import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import ExamPapers from './ExamPapers.jsx';
import { useClassSections } from './ClassSectionSelects.jsx';

export default function ExamTerms() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { classes } = useClassSections(isAdmin);
  const [papersFor, setPapersFor] = useState(null);
  return (
    <>
    <ResourceCrud
      endpoint="/exams/exams"
      labels={{ title: 'exams.tabs.terms', add: 'exams.add', edit: 'exams.edit' }}
      columns={[
        { key: 'name', header: t('exams.nameEn'), render: (r, lang, bt) => bt(r.name, lang) },
        {
          key: 'academicYear',
          header: t('exams.year'),
          render: (r, lang, bt) => bt(r.academicYear?.name, lang) || '—',
        },
        {
          key: 'isPublished',
          header: t('exams.published'),
          render: (r) => (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                r.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {r.isPublished ? t('common.yes') : t('common.no')}
            </span>
          ),
        },
        ...(isAdmin ? [{
          key: 'papers',
          header: t('exams.subjectMarks'),
          render: (r) => (
            <button type="button" onClick={() => setPapersFor(r)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
              {t('exams.setMarks')}
            </button>
          ),
        }] : []),
      ]}
      refs={{ years: '/academics/academic-years' }}
      fields={[
        {
          key: 'name',
          type: 'bilingual',
          labelEn: t('exams.nameEn'),
          labelBn: t('exams.nameBn'),
          requiredEn: true,
        },
        {
          key: 'academicYear',
          type: 'ref',
          label: t('exams.year'),
          refKey: 'years',
          placeholder: t('academics.selectYear'),
        },
        { key: 'startDate', type: 'date', label: t('exams.startDate') },
        { key: 'endDate', type: 'date', label: t('exams.endDate') },
        { key: 'isPublished', type: 'checkbox', label: t('exams.published') },
      ]}
    />
    <ExamPapers open={!!papersFor} exam={papersFor} classes={classes} onClose={() => setPapersFor(null)} />
    </>
  );
}
