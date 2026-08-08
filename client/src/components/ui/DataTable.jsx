import { useTranslation } from 'react-i18next';

/**
 * Generic table.
 * @param {{key:string,header:string,render?:(row)=>any,className?:string}[]} columns
 * @param {object[]} rows
 * @param {object} [pagination] { page, pages, onPage }
 */
export default function DataTable({ columns, rows, loading, pagination }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-semibold ${c.className || ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id || row._id} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>
            {t('common.page')} {pagination.page} {t('common.of')} {pagination.pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPage(pagination.page - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 hover:bg-slate-100"
            >
              {t('common.prev')}
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => pagination.onPage(pagination.page + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40 hover:bg-slate-100"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
