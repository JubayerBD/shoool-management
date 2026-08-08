import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

export default function Classes() {
  const { t } = useTranslation();
  return (
    <ResourceCrud
      endpoint="/academics/classes"
      labels={{ title: 'nav.classes', add: 'academics.addClass', edit: 'academics.editClass' }}
      columns={[
        { key: 'name', header: t('academics.nameEn'), render: (r, lang, bt) => bt(r.name, lang) },
        { key: 'numericLevel', header: t('academics.level') },
        {
          key: 'academicYear',
          header: t('academics.year'),
          render: (r, lang, bt) => bt(r.academicYear?.name, lang) || '—',
        },
      ]}
      refs={{ years: '/academics/academic-years' }}
      fields={[
        {
          key: 'name',
          type: 'bilingual',
          labelEn: t('academics.nameEn'),
          labelBn: t('academics.nameBn'),
          requiredEn: true,
        },
        { key: 'numericLevel', type: 'number', label: t('academics.level') },
        {
          key: 'academicYear',
          type: 'ref',
          label: t('academics.year'),
          refKey: 'years',
          placeholder: t('academics.selectYear'),
        },
      ]}
    />
  );
}
