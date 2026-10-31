import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import FeeStructures from './FeeStructures.jsx';
import Invoices from './Invoices.jsx';
import BillingSchedules from './BillingSchedules.jsx';
import CollectFees from './CollectFees.jsx';
import StudentAccounts from './StudentAccounts.jsx';
import DuesReports from './DuesReports.jsx';
import FeeAdjustments from './FeeAdjustments.jsx';
import { useFeeText } from './FeeUI.jsx';

export default function Fees() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { f } = useFeeText();

  // Only admin/accountant manage fee structures; everyone with access sees invoices.
  const canManageStructures = ['admin', 'accountant'].includes(user.role);
  const tabs = [
    ...(canManageStructures
      ? [
          { key: 'setup', label: f('setup'), el: <FeeStructures /> },
          { key: 'schedules', label: f('schedules'), el: <BillingSchedules /> },
          { key: 'collect', label: f('collect'), el: <CollectFees /> },
          { key: 'reports', label: f('reports'), el: <DuesReports /> },
          { key: 'adjustments', label: f('adjustments'), el: <FeeAdjustments /> },
        ]
      : [
          { key: 'accounts', label: f('accounts'), el: <StudentAccounts /> },
          { key: 'invoices', label: t('fees.tabs.invoices'), el: <Invoices /> },
        ]),
  ];

  const [active, setActive] = useState(tabs[0].key);
  const activeTab = tabs.find((x) => x.key === active) || tabs[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{t('fees.title')}</h1>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 no-print">
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
      )}

      {activeTab.el}
    </div>
  );
}
