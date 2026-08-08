import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';

/** Simple yes/no confirmation built on Modal. */
export default function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('common.delete')}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            {t('common.delete')}
          </button>
        </>
      }
    >
      <p className="text-slate-600">{message || t('common.confirmDelete')}</p>
    </Modal>
  );
}
