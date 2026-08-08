import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { t as bt } from '../utils/bilingual.js';
import BarChart from '../components/charts/BarChart.jsx';
import DonutChart from '../components/charts/DonutChart.jsx';

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || 'text-slate-800'}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const isStaff = ['admin', 'teacher', 'accountant'].includes(user.role);

  useEffect(() => {
    api
      .get('/dashboard/stats')
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    if (isStaff) {
      api
        .get('/dashboard/analytics')
        .then((res) => setAnalytics(res.data))
        .catch(() => setAnalytics(null));
    }
  }, [isStaff]);

  const stats = data?.stats;
  const notices = data?.recentNotices || [];

  const ab = analytics?.attendanceBreakdown;
  const attendanceSegments = ab
    ? [
        { label: t('attendance.present'), value: ab.present, color: '#059669' },
        { label: t('attendance.absent'), value: ab.absent, color: '#dc2626' },
        { label: t('attendance.late'), value: ab.late, color: '#f59e0b' },
        { label: t('attendance.leave'), value: ab.leave, color: '#64748b' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          {t('dashboard.welcome')}, {bt(user.name, lang)}
        </h1>
        <p className="text-sm text-slate-500">{t(`roles.${user.role}`)}</p>
      </div>

      {loading ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label={t('dashboard.totalStudents')} value={stats.students} />
              <StatCard label={t('dashboard.totalTeachers')} value={stats.teachers} />
              <StatCard label={t('dashboard.totalClasses')} value={stats.classes} />
              <StatCard
                label={t('dashboard.totalDue')}
                value={`${t('common.taka')}${Number(stats.totalDue).toLocaleString()}`}
                accent="text-red-600"
              />
            </div>
          )}

          {analytics && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title={t('dashboard.studentsPerClass')}>
                {analytics.studentsPerClass?.length ? (
                  <BarChart
                    data={analytics.studentsPerClass.map((d) => ({
                      label: bt(d.label, lang),
                      value: d.count,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-slate-400">{t('dashboard.noData')}</p>
                )}
              </ChartCard>

              <ChartCard title={t('dashboard.attendance30')}>
                {attendanceSegments.some((s) => s.value > 0) ? (
                  <DonutChart segments={attendanceSegments} />
                ) : (
                  <p className="text-sm text-slate-400">{t('dashboard.noData')}</p>
                )}
              </ChartCard>

              <div className="lg:col-span-2">
                <ChartCard title={t('dashboard.feeCollection')}>
                  {analytics.feeCollection?.length ? (
                    <BarChart
                      data={analytics.feeCollection.map((d) => ({ label: d.label, value: d.total }))}
                      unit={t('common.taka')}
                    />
                  ) : (
                    <p className="text-sm text-slate-400">{t('dashboard.noData')}</p>
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-800">
              {t('dashboard.recentNotices')}
            </h2>
            {notices.length === 0 ? (
              <p className="text-sm text-slate-500">{t('dashboard.noNotices')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notices.map((n) => (
                  <li key={n.id || n._id} className="py-3">
                    <div className="font-medium text-slate-800">
                      {n.isPinned && <span className="mr-1">📌</span>}
                      {bt(n.title, lang)}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-sm text-slate-500">{bt(n.body, lang)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
