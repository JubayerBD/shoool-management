import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/ui/Modal.jsx';
import BilingualInput from '../../components/ui/BilingualInput.jsx';
import ImageUpload from '../../components/ui/ImageUpload.jsx';
import AccountFields from '../../components/ui/AccountFields.jsx';
import ProfileAccountSection from '../../components/ui/ProfileAccountSection.jsx';
import { Field, TextInput, Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const emptyGuardian = () => ({ name: { en: '', bn: '' }, relation: { en: '', bn: '' }, phone: '' });

function emptyStudent() {
  return {
    admissionNo: '',
    roll: '',
    name: { en: '', bn: '' },
    gender: 'male',
    dateOfBirth: '',
    bloodGroup: '',
    photoUrl: '',
    class: '',
    section: '',
    address: { en: '', bn: '' },
    status: 'active',
    guardians: [emptyGuardian()],
  };
}

/** Normalize an existing student record (with populated refs) into form shape. */
function toForm(student) {
  if (!student) return emptyStudent();
  return {
    admissionNo: student.admissionNo || '',
    roll: student.roll ?? '',
    name: { en: student.name?.en || '', bn: student.name?.bn || '' },
    gender: student.gender || 'male',
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : '',
    bloodGroup: student.bloodGroup || '',
    photoUrl: student.photoUrl || '',
    class: student.class?.id || student.class?._id || student.class || '',
    section: student.section?.id || student.section?._id || student.section || '',
    address: { en: student.address?.en || '', bn: student.address?.bn || '' },
    status: student.status || 'active',
    guardians: student.guardians?.length ? student.guardians : [emptyGuardian()],
  };
}

export default function StudentForm({ open, onClose, onSubmit, student, classes, sections, saving }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [form, setForm] = useState(emptyStudent());
  const [account, setAccount] = useState({ create: false, email: '', password: '' });

  // Reset during render (not in an effect) so the form never shows, or loses typing to, stale values.
  const [seen, setSeen] = useState({ open: false, student: null });
  if (seen.open !== open || seen.student !== student) {
    setSeen({ open, student });
    if (open) {
      setForm(toForm(student));
      setAccount({ create: false, email: '', password: '' });
    }
  }

  // Sections belonging to the chosen class.
  const sectionOptions = useMemo(
    () => sections.filter((s) => (s.class?.id || s.class?._id || s.class) === form.class),
    [sections, form.class]
  );

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setGuardian = (idx, patch) =>
    setForm((f) => ({
      ...f,
      guardians: f.guardians.map((g, i) => (i === idx ? { ...g, ...patch } : g)),
    }));

  const addGuardian = () => setForm((f) => ({ ...f, guardians: [...f.guardians, emptyGuardian()] }));
  const removeGuardian = (idx) =>
    setForm((f) => ({ ...f, guardians: f.guardians.filter((_, i) => i !== idx) }));

  const submit = (e) => {
    e.preventDefault();
    // Build payload; drop empty optionals so the API validation stays happy.
    const payload = {
      admissionNo: form.admissionNo.trim(),
      name: form.name,
      gender: form.gender,
      status: form.status,
      address: form.address,
      photoUrl: form.photoUrl || '',
      guardians: form.guardians.filter((g) => g.name.en.trim()),
    };
    if (form.roll !== '') payload.roll = Number(form.roll);
    if (form.dateOfBirth) payload.dateOfBirth = form.dateOfBirth;
    if (form.bloodGroup) payload.bloodGroup = form.bloodGroup;
    if (form.class) payload.class = form.class;
    if (form.section) payload.section = form.section;
    // In add mode, optionally pass login-account details to create alongside.
    const accountInfo = !student && account.create ? { email: account.email, password: account.password } : null;
    onSubmit(payload, accountInfo);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={student ? t('students.edit') : t('students.add')}
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
            form="student-form"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-5">
        <Field label={t('common.photo')}>
          <ImageUpload value={form.photoUrl} onChange={(url) => setField('photoUrl', url)} />
        </Field>

        <BilingualInput
          labelEn={t('students.nameEn')}
          labelBn={t('students.nameBn')}
          value={form.name}
          onChange={(v) => setField('name', v)}
          requiredEn
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t('students.admissionNo')} required>
            <TextInput
              value={form.admissionNo}
              onChange={(e) => setField('admissionNo', e.target.value)}
              required
            />
          </Field>
          <Field label={t('students.roll')}>
            <TextInput
              type="number"
              value={form.roll}
              onChange={(e) => setField('roll', e.target.value)}
            />
          </Field>
          <Field label={t('students.gender')}>
            <Select value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="male">{t('gender.male')}</option>
              <option value="female">{t('gender.female')}</option>
              <option value="other">{t('gender.other')}</option>
            </Select>
          </Field>
          <Field label={t('students.dateOfBirth')}>
            <TextInput
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setField('dateOfBirth', e.target.value)}
            />
          </Field>
          <Field label={t('students.bloodGroup')}>
            <TextInput
              value={form.bloodGroup}
              onChange={(e) => setField('bloodGroup', e.target.value)}
            />
          </Field>
          <Field label={t('students.status')}>
            <Select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="active">{t('status.active')}</option>
              <option value="inactive">{t('status.inactive')}</option>
              <option value="graduated">{t('status.graduated')}</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('students.class')}>
            <Select
              value={form.class}
              onChange={(e) => setForm((f) => ({ ...f, class: e.target.value, section: '' }))}
            >
              <option value="">{t('students.selectClass')}</option>
              {classes.map((c) => (
                <option key={c.id || c._id} value={c.id || c._id}>
                  {bt(c.name, lang)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('students.section')}>
            <Select
              value={form.section}
              onChange={(e) => setField('section', e.target.value)}
              disabled={!form.class}
            >
              <option value="">{t('students.selectSection')}</option>
              {sectionOptions.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {bt(s.name, lang)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <BilingualInput
          labelEn={t('students.addressEn')}
          labelBn={t('students.addressBn')}
          value={form.address}
          onChange={(v) => setField('address', v)}
        />

        {/* Guardians */}
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">{t('students.guardians')}</h3>
            <button
              type="button"
              onClick={addGuardian}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              + {t('students.addGuardian')}
            </button>
          </div>
          <div className="space-y-4">
            {form.guardians.map((g, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field label={t('students.guardianName')}>
                  <TextInput
                    value={g.name.en}
                    onChange={(e) => setGuardian(idx, { name: { ...g.name, en: e.target.value } })}
                  />
                </Field>
                <Field label={`${t('students.guardianName')} (বাংলা)`}>
                  <TextInput
                    value={g.name.bn}
                    onChange={(e) => setGuardian(idx, { name: { ...g.name, bn: e.target.value } })}
                    dir="auto"
                  />
                </Field>
                <Field label={t('students.relation')}>
                  <TextInput
                    value={g.relation?.en || ''}
                    onChange={(e) =>
                      setGuardian(idx, { relation: { ...(g.relation || {}), en: e.target.value } })
                    }
                  />
                </Field>
                <Field label={t('students.phone')}>
                  <div className="flex gap-2">
                    <TextInput
                      value={g.phone}
                      onChange={(e) => setGuardian(idx, { phone: e.target.value })}
                    />
                    {form.guardians.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeGuardian(idx)}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        aria-label="Remove guardian"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            ))}
          </div>
        </div>

        {/* Login account: create alongside on add; manage on edit. */}
        {!student ? (
          <AccountFields value={account} onChange={setAccount} />
        ) : (
          <ProfileAccountSection
            role="student"
            profileId={student.id || student._id}
            profileName={form.name}
          />
        )}
      </form>
    </Modal>
  );
}
