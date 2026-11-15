/**
 * Bangladesh-style GPA grading on a percentage scale.
 * Returns { grade, gradePoint }.
 */
export function gradeFromPercent(percent) {
  if (percent >= 80) return { grade: 'A+', gradePoint: 5.0 };
  if (percent >= 70) return { grade: 'A', gradePoint: 4.0 };
  if (percent >= 60) return { grade: 'A-', gradePoint: 3.5 };
  if (percent >= 50) return { grade: 'B', gradePoint: 3.0 };
  if (percent >= 40) return { grade: 'C', gradePoint: 2.0 };
  if (percent >= 33) return { grade: 'D', gradePoint: 1.0 };
  return { grade: 'F', gradePoint: 0.0 };
}

/** Pass mark used when none has been set: 33% of full marks (30 -> 10, 40 -> 13, 100 -> 33). */
export const defaultPassMarks = (fullMarks) => Math.round(fullMarks * 0.33);

/**
 * Grade one subject. Below the pass mark is always F. At or above it the letter comes from the
 * percentage, but never F: 13 of 40 (32.5%) passes when the pass mark is 13, and earns a D.
 */
export function gradeFromMarks(marksObtained, fullMarks = 100, passMarks = null) {
  const pct = fullMarks > 0 ? (marksObtained / fullMarks) * 100 : 0;
  if (typeof passMarks !== 'number') return gradeFromPercent(pct);
  if (marksObtained < passMarks) return { grade: 'F', gradePoint: 0.0 };
  const graded = gradeFromPercent(pct);
  return graded.grade === 'F' ? { grade: 'D', gradePoint: 1.0 } : graded;
}
