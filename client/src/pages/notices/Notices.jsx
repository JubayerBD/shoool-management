import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';

const AUDIENCE_VALUES = ['all', 'teacher', 'student', 'parent', 'accountant'];

export default function Notices() {
  const { t } = useTranslation();

  const audienceOptions = AUDIENCE_VALUES.map((v) => ({
    value: v,
    label: t(`notices.audiences.${v}`),
  }));

  return (
    <ResourceCrud
      endpoint="/schedule/notices"
      labels={{ title: 'notices.title', add: 'notices.add', edit: 'notices.edit' }}
      manageRoles={['admin']}
      columns={[
        {
          key: 'title',
          header: t('notices.titleEn'),
          render: (r, lang, bt) => (
            <span>
              {r.isPinned && <span className="mr-1">📌</span>}
              {bt(r.title, lang)}
            </span>
          ),
        },
        {
          key: 'audience',
          header: t('notices.audience'),
          render: (r) =>
            (r.audience?.length ? r.audience : ['all'])
              .map((a) => t(`notices.audiences.${a}`))
              .join(', '),
        },
        {
          key: 'publishedAt',
          header: t('notices.publishedAt'),
          render: (r) => (r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : '—'),
        },
      ]}
      fields={[
        {
          key: 'title',
          type: 'bilingual',
          labelEn: t('notices.titleEn'),
          labelBn: t('notices.titleBn'),
          requiredEn: true,
        },
        {
          key: 'body',
          type: 'bilingual',
          multiline: true,
          labelEn: t('notices.bodyEn'),
          labelBn: t('notices.bodyBn'),
        },
        {
          key: 'audience',
          type: 'multiselect',
          label: t('notices.audience'),
          options: audienceOptions,
          default: ['all'],
        },
        { key: 'expiresAt', type: 'date', label: t('notices.expiresAt') },
        { key: 'isPinned', type: 'checkbox', label: t('notices.pinned') },
      ]}
    />
  );
}
