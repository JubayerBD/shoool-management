import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../ui/DataTable.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import ResourceForm from './ResourceForm.jsx';

/**
 * Full CRUD screen driven by config.
 *
 * @param {object} props
 * @param {string} props.endpoint            e.g. '/academics/classes'
 * @param {{title:string,add:string,edit:string}} props.labels  i18n keys.
 * @param {object[]} props.columns           DataTable columns (render fns get `lang`).
 * @param {object[]} props.fields            ResourceForm field configs.
 * @param {Object<string,string>} [props.refs]  refKey -> endpoint for ref option lists.
 * @param {string[]} [props.manageRoles]     roles allowed to add/edit/delete.
 */
export default function ResourceCrud({
  endpoint,
  labels,
  columns,
  fields,
  refs = {},
  manageRoles = ['admin'],
  accountRole,
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const canManage = manageRoles.includes(user.role);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refData, setRefData] = useState({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Load ref option-lists once.
  useEffect(() => {
    const keys = Object.keys(refs);
    if (!keys.length) return;
    Promise.all(keys.map((k) => api.get(refs[k], { params: { limit: 500 } }))).then((responses) => {
      const next = {};
      keys.forEach((k, i) => {
        next[k] = responses[i].data.items;
      });
      setRefData(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (search) params.search = search;
      const res = await api.get(endpoint, { params });
      setRows(res.data.items);
      setMeta({ page: res.data.page, pages: res.data.pages });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, search]);

  useEffect(() => {
    const id = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const handleSubmit = async (payload, account) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing.id || editing._id}`, payload);
      } else {
        const res = await api.post(endpoint, payload);
        // Optionally create a linked login account for the new record.
        if (accountRole && account) {
          try {
            await api.post('/users', {
              name: payload.name,
              email: account.email,
              password: account.password,
              role: accountRole,
              [accountRole]: res.data.item.id,
            });
            push(t('accounts.accountCreated'));
          } catch (err) {
            push(
              t('accounts.accountFailed', {
                reason: err.response?.data?.error?.message || 'error',
              }),
              'error'
            );
          }
        }
      }
      setFormOpen(false);
      push(t('common.save') + ' ✓');
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`${endpoint}/${deleteId}`);
      push(t('common.delete') + ' ✓');
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  // Resolve column render fns, injecting current language.
  const resolvedColumns = columns.map((c) => ({
    ...c,
    render: c.render ? (row) => c.render(row, lang, bt) : undefined,
  }));

  if (canManage) {
    resolvedColumns.push({
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(row);
              setFormOpen(true);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => setDeleteId(row.id || row._id)}
            className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t(labels.title)}</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + {t(labels.add)}
          </button>
        )}
      </div>

      <input
        type="search"
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => {
          setPage(1);
          setSearch(e.target.value);
        }}
        className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      />

      <DataTable
        columns={resolvedColumns}
        rows={rows}
        loading={loading}
        pagination={{ page: meta.page, pages: meta.pages, onPage: setPage }}
      />

      <ResourceForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        record={editing}
        fields={fields}
        refs={refData}
        saving={saving}
        titleKey={{ add: labels.add, edit: labels.edit }}
        accountRole={accountRole}
      />

      <ConfirmDialog open={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
