import { useState } from 'react';
import ResourceCrud from '../../components/crud/ResourceCrud.jsx';
import api from '../../api/client.js';
import FeePlans from './FeePlans.jsx';
import { useFeeText, useFeeReferences, Notice, ErrorNotice, buttonClass, recordId } from './FeeUI.jsx';

export default function FeeStructures() {
  const { f, bt, money } = useFeeText();
  const [active, setActive] = useState('types');
  const refs = useFeeReferences();
  const [stopped, setStopped] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = async (id) => {
    setBusy(true); setError('');
    try { await api.post(`/fees/structures/${id}/stop-automation`); setStopped((ids) => [...ids, id]); }
    catch (err) { setError(err.response?.data?.error?.message || f('error')); }
    finally { setBusy(false); }
  };
  const legacy = refs.types.filter((type) => type.autoGenerate && !stopped.includes(recordId(type)));
  return <div className="space-y-4">
    <div className="flex gap-2">{['types', 'plans'].map((tab) => <button key={tab} onClick={() => setActive(tab)} className={active === tab ? `${buttonClass} border-brand-300 bg-brand-50 text-brand-700` : buttonClass}>{f(tab)}</button>)}</div>
    <ErrorNotice error={error || refs.error} />
    {legacy.length > 0 && <Notice><span>{f('legacyHint')}</span>{legacy.map((type) => <div key={recordId(type)} className="mt-2 flex items-center justify-between gap-3"><span>{bt(type.name)}</span><button disabled={busy} className={buttonClass} onClick={() => stop(recordId(type))}>{f('stopLegacy')}</button></div>)}</Notice>}
    {active === 'plans' ? <FeePlans /> : <>
      <Notice>{f('typeHint')}</Notice>
      <ResourceCrud endpoint="/fees/structures" manageRoles={['admin', 'accountant']}
        labels={{ title: 'feeFlow.types', add: 'feeFlow.addType', edit: 'feeFlow.editType' }}
        columns={[
          { key: 'name', header: f('name'), render: (row) => bt(row.name) },
          { key: 'amount', header: f('perStudent'), render: (row) => money(row.amount) },
          { key: 'isActive', header: f('status'), render: (row) => f(row.isActive ? 'active' : 'inactive') },
        ]}
        fields={[
          { key: 'name', type: 'bilingual', labelEn: f('name'), labelBn: f('nameBn'), requiredEn: true },
          { key: 'amount', type: 'number', label: f('perStudent'), required: true, min: 0, step: '0.01' },
          { key: 'isActive', type: 'checkbox', label: f('active'), default: true },
        ]} />
    </>}
  </div>;
}
