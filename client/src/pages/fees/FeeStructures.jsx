import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

export default function FeeStructures() {
  const { t } = useTranslation();
  return (
    <ResourceCrud
      endpoint="/fees/structures"
      labels={{ title: 'fees.tabs.structures', add: 'fees.addStructure', edit: 'fees.editStructure' }}
      manageRoles={['admin', 'accountant']}
      columns={[
        { key: 'name', header: t('fees.nameEn'), render: (r, lang, bt) => bt(r.name, lang) },
        {
          key: 'amount',
          header: t('fees.amount'),
          render: (r) => `${t('common.taka')}${Number(r.amount).toLocaleString()}`,
        },
        { key: 'frequency', header: t('fees.frequency'), render: (r) => t(`fees.freq.${r.frequency}`) },
        {
          key: 'class',
          header: t('fees.class'),
          render: (r, lang, bt) => bt(r.class?.name, lang) || t('common.all'),
        },
        {
          key: 'isActive',
          header: t('fees.active'),
          render: (r) => (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {r.isActive ? t('common.yes') : t('common.no')}
            </span>
          ),
        },
      ]}
      refs={{ classes: '/academics/classes', years: '/academics/academic-years' }}
      fields={[
        {
          key: 'name',
          type: 'bilingual',
          labelEn: t('fees.nameEn'),
          labelBn: t('fees.nameBn'),
          requiredEn: true,
        },
        { key: 'amount', type: 'number', label: t('fees.amount'), required: true },
        {
          key: 'frequency',
          type: 'select',
          label: t('fees.frequency'),
          options: [
            { value: 'monthly', label: t('fees.freq.monthly') },
            { value: 'one_time', label: t('fees.freq.one_time') },
            { value: 'quarterly', label: t('fees.freq.quarterly') },
            { value: 'yearly', label: t('fees.freq.yearly') },
          ],
        },
        {
          key: 'class',
          type: 'ref',
          label: t('fees.class'),
          refKey: 'classes',
          placeholder: t('common.all'),
        },
        {
          key: 'academicYear',
          type: 'ref',
          label: t('fees.year'),
          refKey: 'years',
          placeholder: t('academics.selectYear'),
        },
        { key: 'isActive', type: 'checkbox', label: t('fees.active'), default: true },
      ]}
    />
  );
}
