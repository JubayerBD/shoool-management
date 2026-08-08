import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

export default function Sections() {
  const { t } = useTranslation();
  return (
    <ResourceCrud
      endpoint="/academics/sections"
      labels={{ title: 'nav.sections', add: 'academics.addSection', edit: 'academics.editSection' }}
      columns={[
        { key: 'name', header: t('academics.nameEn'), render: (r, lang, bt) => bt(r.name, lang) },
        {
          key: 'class',
          header: t('academics.class'),
          render: (r, lang, bt) => bt(r.class?.name, lang) || '—',
        },
        { key: 'room', header: t('academics.room') },
        { key: 'capacity', header: t('academics.capacity') },
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
        {
          key: 'class',
          type: 'ref',
          label: t('academics.class'),
          refKey: 'classes',
          placeholder: t('students.selectClass'),
          required: true,
        },
        { key: 'room', type: 'text', label: t('academics.room') },
        { key: 'capacity', type: 'number', label: t('academics.capacity') },
      ]}
    />
  );
}
