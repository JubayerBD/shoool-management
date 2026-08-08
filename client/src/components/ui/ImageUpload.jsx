import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useToast } from './Toast.jsx';

/**
 * Image picker that uploads immediately and reports back the stored URL.
 * @param {string} value            Current image URL.
 * @param {(url:string)=>void} onChange
 */
export default function ImageUpload({ value, onChange }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/uploads', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data.url);
    } catch (err) {
      push(err.response?.data?.error?.message || 'Upload failed', 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
            👤
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('common.uploadPhoto')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-left text-xs text-red-500 hover:underline"
          >
            {t('common.removePhoto')}
          </button>
        )}
      </div>
    </div>
  );
}
