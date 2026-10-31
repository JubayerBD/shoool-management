import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';
import GenerateInvoiceModal from './GenerateInvoiceModal.jsx';
import InvoiceDetail from './InvoiceDetail.jsx';

export default function FeeStructures() {
  const { t } = useTranslation();
  const [invoiceFor, setInvoiceFor] = useState(null); // structure to invoice from
  const [detailId, setDetailId] = useState(null); // newly created invoice to print

  return (
    <>
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
        {
          key: 'generate',
          header: '',
          className: 'text-right',
          render: (r) => (
            <button
              type="button"
              onClick={() => setInvoiceFor(r)}
              className="whitespace-nowrap rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              🧾 {t('fees.generate')}
            </button>
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

      <GenerateInvoiceModal
        structure={invoiceFor}
        onClose={() => setInvoiceFor(null)}
        onCreated={(id) => {
          setInvoiceFor(null);
          setDetailId(id);
        }}
      />
      <InvoiceDetail
        open={!!detailId}
        invoiceId={detailId}
        onClose={() => setDetailId(null)}
        canPay
        onChanged={() => {}}
      />
    </>
  );
}
