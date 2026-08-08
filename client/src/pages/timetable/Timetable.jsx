import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useOwnStudent } from '../../hooks/useOwnStudent.js';
import { useToast } from '../../components/ui/Toast.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function AddPeriodModal({ open, onClose, onSubmit, subjects, teachers, saving }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [form, setForm] = useState({
    dayOfWeek: '0',
    startTime: '09:00',
    endTime: '09:45',
    subject: '',
    teacher: '',
    room: '',
  });

  useEffect(() => {
    if (open)
      setForm({ dayOfWeek: '0', startTime: '09:00', endTime: '09:45', subject: '', teacher: '', room: '' });
  }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
    };
    if (form.subject) payload.subject = form.subject;
    if (form.teacher) payload.teacher = form.teacher;
    if (form.room) payload.room = form.room;
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('timetable.addPeriod')}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="period-form"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="period-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('timetable.day')} required>
          <Select value={form.dayOfWeek} onChange={(e) => set('dayOfWeek', e.target.value)}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {t(`timetable.days.${d}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('timetable.room')}>
          <TextInput value={form.room} onChange={(e) => set('room', e.target.value)} />
        </Field>
        <Field label={t('timetable.startTime')} required>
          <TextInput type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label={t('timetable.endTime')} required>
          <TextInput type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
        <Field label={t('timetable.subject')}>
          <Select value={form.subject} onChange={(e) => set('subject', e.target.value)}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id || s._id} value={s.id || s._id}>
                {bt(s.name, lang)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('timetable.teacher')}>
          <Select value={form.teacher} onChange={(e) => set('teacher', e.target.value)}>
            <option value="">—</option>
            {teachers.map((tc) => (
              <option key={tc.id || tc._id} value={tc.id || tc._id}>
                {bt(tc.name, lang)}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

export default function Timetable() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { push } = useToast();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const canManage = ['admin', 'teacher'].includes(user.role);
  const selfService = ['student', 'parent'].includes(user.role);
  const own = useOwnStudent();

  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [section, setSection] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/academics/sections', { params: { limit: 500 } }).then((r) => setSections(r.data.items));
    api.get('/academics/subjects', { params: { limit: 500 } }).then((r) => setSubjects(r.data.items));
    api.get('/people/teachers', { params: { limit: 500 } }).then((r) => setTeachers(r.data.items));
  }, []);

  const loadSlots = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    try {
      const res = await api.get('/schedule/timetable', { params: { section, limit: 500 } });
      setSlots(res.data.items);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // Self-service: lock the section to the student's own section.
  useEffect(() => {
    if (selfService && own.student) {
      const sid = own.student.section?.id || own.student.section?._id || own.student.section;
      if (sid) setSection(sid);
    }
  }, [selfService, own.student]);

  // Subjects for the chosen section's class.
  const sectionClassId = useMemo(() => {
    const s = sections.find((x) => (x.id || x._id) === section);
    return s?.class?.id || s?.class?._id || s?.class || '';
  }, [sections, section]);
  const sectionSubjects = useMemo(
    () =>
      subjects.filter((s) => {
        const cls = s.class?.id || s.class?._id || s.class;
        return !cls || cls === sectionClassId;
      }),
    [subjects, sectionClassId]
  );

  const byDay = useMemo(() => {
    const map = {};
    for (const d of DAYS) map[d] = [];
    for (const slot of slots) map[slot.dayOfWeek]?.push(slot);
    for (const d of DAYS) map[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [slots]);

  const addPeriod = async (payload) => {
    setSaving(true);
    try {
      await api.post('/schedule/timetable', { ...payload, section });
      setModalOpen(false);
      push(t('timetable.saved'));
      loadSlots();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removePeriod = async (id) => {
    try {
      await api.delete(`/schedule/timetable/${id}`);
      push(t('timetable.deleted'));
      loadSlots();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Error', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">{t('timetable.title')}</h1>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {selfService ? (
          own.student && (
            <div className="text-sm text-slate-600">
              {bt(own.student.class?.name, lang)} — {bt(own.student.section?.name, lang)}
            </div>
          )
        ) : (
          <div className="w-64">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('students.section')}
            </label>
            <Select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">{t('timetable.selectSection')}</option>
              {sections.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.class?.name, lang)} — {bt(s.name, lang)}
                </option>
              ))}
            </Select>
          </div>
        )}
        {canManage && section && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + {t('timetable.addPeriod')}
          </button>
        )}
      </div>

      {!section ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {t('timetable.chooseSection')}
        </div>
      ) : loading ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-7 gap-3">
            {DAYS.map((d) => (
              <div key={d} className="rounded-xl bg-white p-3 shadow-sm">
                <div className="mb-2 border-b border-slate-200 pb-2 text-center text-sm font-semibold text-slate-700">
                  {t(`timetable.days.${d}`)}
                </div>
                <div className="space-y-2">
                  {byDay[d].length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-300">{t('timetable.noPeriods')}</p>
                  ) : (
                    byDay[d].map((slot) => (
                      <div
                        key={slot.id || slot._id}
                        className="group relative rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm"
                      >
                        <div className="text-xs font-medium text-brand-600">
                          {slot.startTime}–{slot.endTime}
                        </div>
                        <div className="font-medium text-slate-800">
                          {bt(slot.subject?.name, lang) || '—'}
                        </div>
                        {slot.teacher && (
                          <div className="text-xs text-slate-500">{bt(slot.teacher?.name, lang)}</div>
                        )}
                        {slot.room && <div className="text-xs text-slate-400">{slot.room}</div>}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => removePeriod(slot.id || slot._id)}
                            className="absolute right-1 top-1 hidden rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddPeriodModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={addPeriod}
        subjects={sectionSubjects}
        teachers={teachers}
        saving={saving}
      />
    </div>
  );
}
