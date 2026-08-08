import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

export default function ExamTerms() {
  const { t } = useTranslation();
  return (
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
  );
}
