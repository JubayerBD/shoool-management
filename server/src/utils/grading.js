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

export function gradeFromMarks(marksObtained, fullMarks = 100) {
  const pct = fullMarks > 0 ? (marksObtained / fullMarks) * 100 : 0;
  return gradeFromPercent(pct);
}
