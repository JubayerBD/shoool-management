import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FinanceOverview from './FinanceOverview.jsx';
import Income from './Income.jsx';
import Expenses from './Expenses.jsx';
import Salaries from './Salaries.jsx';
import FinanceReports from './FinanceReports.jsx';
import FinanceSettings from './FinanceSettings.jsx';
import NetProfit from './NetProfit.jsx';
import Corrections from './Corrections.jsx';

export default function Finance() {
  const { t, i18n } = useTranslation();

  const tabs = [
    { key: 'overview', label: t('finance.tabs.overview'), el: <FinanceOverview /> },
    { key: 'income', label: t('finance.tabs.income'), el: <Income /> },
    { key: 'expenses', label: t('finance.tabs.expenses'), el: <Expenses /> },
    { key: 'salaries', label: t('finance.tabs.salaries'), el: <Salaries /> },
    { key: 'reports', label: t('finance.tabs.reports'), el: <FinanceReports /> },
    { key: 'profit', label: i18n.language?.startsWith('bn') ? 'নিট লাভ' : 'Net profit', el: <NetProfit /> },
    { key: 'corrections', label: i18n.language?.startsWith('bn') ? 'সংশোধন' : 'Corrections', el: <Corrections /> },
    { key: 'settings', label: t('finance.tabs.settings'), el: <FinanceSettings /> },
  ];

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const active = requestedTab === 'balance' ? 'overview' : requestedTab || 'overview';
  const setActive = (key) => setSearchParams({ tab: key });
  const activeTab = tabs.find((x) => x.key === active) || tabs[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{t('finance.title')}</h1>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
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

      {activeTab.el}
    </div>
  );
}
