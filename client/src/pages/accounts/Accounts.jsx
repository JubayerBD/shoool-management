import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../../components/ui/DataTable.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import AccountForm from './AccountForm.jsx';

const roleBadge = {
  admin: 'bg-purple-100 text-purple-700',
  teacher: 'bg-blue-100 text-blue-700',
  student: 'bg-emerald-100 text-emerald-700',
  parent: 'bg-amber-100 text-amber-700',
  accountant: 'bg-slate-100 text-slate-700',
};

export default function Accounts() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [pwValue, setPwValue] = useState('');

  useEffect(() => {
    api.get('/people/students', { params: { limit: 500 } }).then((r) => setStudents(r.data.items));
    api.get('/people/teachers', { params: { limit: 500 } }).then((r) => setTeachers(r.data.items));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await api.get('/users', { params });
      setRows(res.data.items);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const id = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  const handleSubmit = async (payload) => {
    setSaving(true);
    try {
      if (editing) await api.put(`/users/${editing.id || editing._id}`, payload);
      else await api.post('/users', payload);
      setFormOpen(false);
      push(editing ? t('accounts.updated') : t('accounts.created'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/users/${deleteId}`);
      push(t('accounts.deleted'));
      load();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/users/${pwUser.id || pwUser._id}/password`, { password: pwValue });
      push(t('accounts.passwordReset'));
      setPwUser(null);
      setPwValue('');
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    }
  };

  const linkedLabel = (u) => {
    if (u.student) return `${bt(u.student.name, lang)} (${u.student.admissionNo})`;
    if (u.teacher) return `${bt(u.teacher.name, lang)} (${u.teacher.employeeId})`;
    if (u.children?.length) return u.children.map((c) => bt(c.name, lang)).join(', ');
    return t('accounts.none');
  };

  const isSelf = (u) => String(u.id || u._id) === String(user.id);

  const columns = [
    {
      key: 'name',
      header: t('accounts.nameEn'),
      render: (u) => (
        <div className="flex items-center gap-2">
          <Avatar name={bt(u.name, lang)} />
          <div>
            <div className="font-medium text-slate-800">
              {bt(u.name, lang)}
              {isSelf(u) && <span className="ml-1 text-xs text-slate-400">({t('accounts.you')})</span>}
            </div>
            <div className="text-xs text-slate-500">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('accounts.role'),
      render: (u) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge[u.role] || ''}`}>
          {t(`roles.${u.role}`)}
        </span>
      ),
    },
    { key: 'linked', header: t('accounts.linkedProfile'), render: (u) => linkedLabel(u) },
    {
      key: 'active',
      header: t('accounts.active'),
      render: (u) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {u.isActive ? t('common.yes') : t('common.no')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (u) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(u);
              setFormOpen(true);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPwUser(u);
              setPwValue('');
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('accounts.resetPassword')}
          </button>
          {!isSelf(u) && (
            <button
              type="button"
              onClick={() => setDeleteId(u.id || u._id)}
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t('accounts.title')}</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + {t('accounts.add')}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <div className="w-44">
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {['admin', 'teacher', 'student', 'parent', 'accountant'].map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      <AccountForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        account={editing}
        students={students}
        teachers={teachers}
        saving={saving}
      />

      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        size="md"
        title={t('accounts.resetPassword')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPwUser(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="pw-form"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t('common.save')}
            </button>
          </>
        }
      >
        <form id="pw-form" onSubmit={submitPassword}>
          {pwUser && <p className="mb-3 text-sm text-slate-500">{pwUser.email}</p>}
          <Field label={t('accounts.newPassword')} required>
            <TextInput
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              required
              minLength={6}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
