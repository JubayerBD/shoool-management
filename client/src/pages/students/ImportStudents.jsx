import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import Modal from '../../components/ui/Modal.jsx';

const TEMPLATE =
  'admissionNo,roll,nameEn,nameBn,gender,className,sectionName,guardianName,guardianPhone\n' +
  'A-3001,10,Rahim Mia,রহিম মিয়া,male,Class 6,A,Karim Mia,01700000000\n';

export default function ImportStudents({ open, onClose, onDone }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/people/students/import', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onDone?.();
    } catch (err) {
      setResult({ error: err.response?.data?.error?.message || 'Import failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('students.importTitle')}
      footer={
        <>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!file || busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('students.importing') : t('students.runImport')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{t('students.importHint')}</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-100"
          >
            ⬇ {t('students.downloadTemplate')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>

        {result && (
          <div className="rounded-lg border border-slate-200 p-3">
            {result.error ? (
              <p className="text-sm text-red-600">{result.error}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-emerald-700">
                  {t('students.importResult', { created: result.created, total: result.total })}
                </p>
                {result.failed?.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-semibold text-slate-700">
                      {t('students.failedRows')} ({result.failed.length})
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-1 pr-2">{t('students.row')}</th>
                            <th className="py-1 pr-2">{t('students.admissionNo')}</th>
                            <th className="py-1">{t('students.reason')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.failed.map((f, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-2 text-slate-500">{f.row}</td>
                              <td className="py-1 pr-2">{f.admissionNo || '—'}</td>
                              <td className="py-1 text-red-600">{f.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
