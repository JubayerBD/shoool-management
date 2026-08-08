import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { t as bt } from '../../utils/bilingual.js';
import DataTable from '../../components/ui/DataTable.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Select } from '../../components/ui/Field.jsx';
import StudentForm from './StudentForm.jsx';
import ImportStudents from './ImportStudents.jsx';

const statusBadge = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  graduated: 'bg-blue-100 text-blue-700',
};

export default function Students() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const canManage = user.role === 'admin';

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);

  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Load class/section options once.
  useEffect(() => {
    api.get('/academics/classes', { params: { limit: 200 } }).then((r) => setClasses(r.data.items));
    api.get('/academics/sections', { params: { limit: 500 } }).then((r) => setSections(r.data.items));
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (search) params.search = search;
      if (classFilter) params.class = classFilter;
      const res = await api.get('/people/students', { params });
      setRows(res.data.items);
      setMeta({ page: res.data.page, pages: res.data.pages });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, classFilter]);

  useEffect(() => {
    const id = setTimeout(loadStudents, search ? 300 : 0); // debounce search
    return () => clearTimeout(id);
  }, [loadStudents, search]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setFormOpen(true);
  };

  const handleSubmit = async (payload, account) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/people/students/${editing.id || editing._id}`, payload);
        push(t('students.saved'));
      } else {
        const res = await api.post('/people/students', payload);
        push(t('students.saved'));
        // Optionally create a linked login account for the new student.
        if (account) {
          try {
            await api.post('/users', {
              name: payload.name,
              email: account.email,
              password: account.password,
              role: 'student',
              student: res.data.item.id,
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
      loadStudents();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/people/students/${deleteId}`);
      push(t('students.deleted'));
      loadStudents();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const columns = [
    {
      key: 'photo',
      header: '',
      className: 'w-12',
      render: (r) => <Avatar src={r.photoUrl} name={bt(r.name, lang)} />,
    },
    { key: 'roll', header: t('students.roll'), className: 'w-16' },
    { key: 'admissionNo', header: t('students.admissionNo') },
    { key: 'name', header: t('students.nameEn'), render: (r) => bt(r.name, lang) },
    { key: 'class', header: t('students.class'), render: (r) => bt(r.class?.name, lang) || '—' },
    { key: 'section', header: t('students.section'), render: (r) => bt(r.section?.name, lang) || '—' },
    { key: 'gender', header: t('students.gender'), render: (r) => t(`gender.${r.gender}`) },
    {
      key: 'status',
      header: t('students.status'),
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[r.status] || ''}`}>
          {t(`status.${r.status}`)}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-right',
            render: (r) => (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(r)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteId(r.id || r._id)}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('common.delete')}
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t('students.title')}</h1>
        {canManage && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              {t('students.import')}
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + {t('students.add')}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
        <div className="w-48">
          <Select
            value={classFilter}
            onChange={(e) => {
              setPage(1);
              setClassFilter(e.target.value);
            }}
          >
            <option value="">{t('common.all')} — {t('students.class')}</option>
            {classes.map((c) => (
              <option key={c.id || c._id} value={c.id || c._id}>
                {bt(c.name, lang)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        pagination={{ page: meta.page, pages: meta.pages, onPage: setPage }}
      />

      <StudentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        student={editing}
        classes={classes}
        sections={sections}
        saving={saving}
      />

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <ImportStudents
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={loadStudents}
      />
    </div>
  );
}
