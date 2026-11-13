/** Human-readable message from a failed API call; prefers the specific field problem over "Validation failed". */
export function apiError(err, fallback = 'Error') {
  const problem = err?.response?.data?.error;
  const detail = problem?.message === 'Validation failed' ? Object.values(problem.details || {}).find((value) => typeof value === 'string') : null;
  return detail || problem?.message || fallback;
}
