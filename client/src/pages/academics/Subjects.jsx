import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

export default function Subjects() {
  const { t } = useTranslation();
  return (
    <ResourceCrud
      endpoint="/academics/subjects"
      labels={{ title: 'nav.subjects', add: 'academics.addSubject', edit: 'academics.editSubject' }}
      columns={[
        { key: 'name', header: t('academics.nameEn'), render: (r, lang, bt) => bt(r.name, lang) },
        { key: 'code', header: t('academics.code') },
        {
          key: 'class',
          header: t('academics.class'),
          render: (r, lang, bt) => bt(r.class?.name, lang) || '—',
        },
        { key: 'fullMarks', header: t('academics.fullMarks') },
        { key: 'passMarks', header: t('academics.passMarks') },
      ]}
      refs={{ classes: '/academics/classes' }}
      fields={[
        {
          key: 'name',
          type: 'bilingual',
          labelEn: t('academics.nameEn'),
          labelBn: t('academics.nameBn'),
          requiredEn: true,
        },
        { key: 'code', type: 'text', label: t('academics.code') },
        {
          key: 'class',
          type: 'ref',
          label: t('academics.class'),
          refKey: 'classes',
          placeholder: t('students.selectClass'),
        },
        { key: 'fullMarks', type: 'number', label: t('academics.fullMarks'), default: 100 },
        { key: 'passMarks', type: 'number', label: t('academics.passMarks'), default: 33 },
      ]}
    />
  );
}
