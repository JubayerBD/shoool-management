import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAll } from '../../api/getAll.js';
import { Select } from '../../components/ui/Field.jsx';
import { t as bt } from '../../utils/bilingual.js';

const idOf = (item) => String(item?.id || item?._id || item || '');

/** Classes and sections for the exam screens' pickers. */
export function useClassSections(enabled = true) {
  const [classes, setClasses] = useState([]);
  const [sections, setSections] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    getAll('/academics/classes').then((r) => setClasses(r.data.items)).catch(() => {});
    getAll('/academics/sections').then((r) => setSections(r.data.items)).catch(() => {});
  }, [enabled]);
  return { classes, sections };
}

/**
 * Class picker with an optional section. Leaving the section empty means the whole class;
 * the section box is disabled when the class has no sections at all.
 * `yearId` (the chosen exam's academic year) hides classes from other years.
 */
export default function ClassSectionSelects({ classes, sections, klass, section, onChange, yearId, lang }) {
  const { t } = useTranslation();
  const classOptions = classes.filter((item) => !yearId || !item.academicYear || idOf(item.academicYear) === String(yearId));
  const sectionOptions = sections.filter((item) => idOf(item.class) === klass);
  return (
    <>
      <div className="w-full sm:w-52">
        <label htmlFor="exam-class" className="mb-1 block text-sm font-medium text-slate-700">{t('academics.class')}</label>
        <Select id="exam-class" value={klass} onChange={(e) => onChange({ klass: e.target.value, section: '' })}>
          <option value="">{t('attendance.selectClass')}</option>
          {classOptions.map((item) => (
            <option key={idOf(item)} value={idOf(item)}>{bt(item.name, lang)}</option>
          ))}
        </Select>
      </div>
      <div className="w-full sm:w-52">
        <label htmlFor="exam-section" className="mb-1 block text-sm font-medium text-slate-700">{t('attendance.optionalSection')}</label>
        <Select id="exam-section" value={section} disabled={!klass || !sectionOptions.length} onChange={(e) => onChange({ klass, section: e.target.value })}>
          <option value="">{t(sectionOptions.length ? 'attendance.allSections' : 'attendance.noSection')}</option>
          {sectionOptions.map((item) => (
            <option key={idOf(item)} value={idOf(item)}>{bt(item.name, lang)}</option>
          ))}
        </Select>
      </div>
    </>
  );
}

export const examYearId = (exams, exam) => {
  const found = exams.find((item) => idOf(item) === exam);
  return found?.academicYear ? idOf(found.academicYear) : '';
};
