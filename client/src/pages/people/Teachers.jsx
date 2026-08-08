import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { t as bt } from '../../utils/bilingual.js';

const statusBadge = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
};

export default function Teachers() {
  const { t } = useTranslation();
  return (
    <ResourceCrud
      endpoint="/people/teachers"
      labels={{ title: 'nav.teachers', add: 'teachers.add', edit: 'teachers.edit' }}
      manageRoles={['admin']}
      accountRole="teacher"
      columns={[
        {
          key: 'photo',
          header: '',
          className: 'w-12',
          render: (r, lang) => <Avatar src={r.photoUrl} name={bt(r.name, lang)} />,
        },
        { key: 'employeeId', header: t('teachers.employeeId') },
        { key: 'name', header: t('teachers.nameEn'), render: (r, lang, localBt) => localBt(r.name, lang) },
        {
          key: 'designation',
          header: t('teachers.designation'),
          render: (r, lang, bt) => bt(r.designation, lang) || '—',
        },
        { key: 'phone', header: t('teachers.phone') },
        { key: 'email', header: t('teachers.email') },
        {
          key: 'status',
          header: t('teachers.status'),
          render: (r) => (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                statusBadge[r.status] || ''
              }`}
            >
              {t(`status.${r.status}`)}
            </span>
          ),
        },
      ]}
      refs={{ subjects: '/academics/subjects' }}
      fields={[
        { key: 'photoUrl', type: 'image', label: t('common.photo') },
        {
          key: 'name',
          type: 'bilingual',
          labelEn: t('teachers.nameEn'),
          labelBn: t('teachers.nameBn'),
          requiredEn: true,
        },
        { key: 'employeeId', type: 'text', label: t('teachers.employeeId'), required: true },
        {
          key: 'gender',
          type: 'select',
          label: t('teachers.gender'),
          options: [
            { value: 'male', label: t('gender.male') },
            { value: 'female', label: t('gender.female') },
            { value: 'other', label: t('gender.other') },
          ],
        },
        {
          key: 'designation',
          type: 'bilingual',
          labelEn: t('teachers.designationEn'),
          labelBn: t('teachers.designationBn'),
        },
        { key: 'phone', type: 'text', label: t('teachers.phone') },
        { key: 'email', type: 'text', label: t('teachers.email') },
        { key: 'joiningDate', type: 'date', label: t('teachers.joiningDate') },
        {
          key: 'status',
          type: 'select',
          label: t('teachers.status'),
          options: [
            { value: 'active', label: t('status.active') },
            { value: 'inactive', label: t('status.inactive') },
          ],
        },
        {
          key: 'subjects',
          type: 'multiref',
          label: t('teachers.subjects'),
          refKey: 'subjects',
        },
        {
          key: 'address',
          type: 'bilingual',
          labelEn: t('teachers.addressEn'),
          labelBn: t('teachers.addressBn'),
        },
      ]}
    />
  );
}
