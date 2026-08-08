import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole } from '../config/nav.js';
import { t as bt } from '../utils/bilingual.js';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const items = navForRole(user.role);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col bg-slate-900 text-slate-100 md:flex">
        <div className="border-b border-slate-700 px-5 py-4">
          <div className="text-lg font-bold">{t('app.name')}</div>
          <div className="text-xs text-slate-400">{t('app.tagline')}</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="text-sm text-slate-500">
            {t(`roles.${user.role}`)}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{bt(user.name, lang)}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t('auth.logout')}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
