import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole } from '../config/nav.js';
import { t as bt } from '../utils/bilingual.js';
import LanguageSwitcher from './LanguageSwitcher.jsx';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  const items = navForRole(user.role);

  // The phone menu closes after navigating and on Esc.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const navLinks = items.map((item) => (
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
  ));

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
          {navLinks}
        </nav>
      </aside>

      {/* Phone menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t('common.cancel')}
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside id="mobile-menu" className="relative flex h-full w-64 max-w-[80%] flex-col bg-slate-900 text-slate-100 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <div className="text-lg font-bold">{t('app.name')}</div>
                <div className="text-xs text-slate-400">{t('app.tagline')}</div>
              </div>
              <button
                type="button"
                aria-label={t('common.cancel')}
                className="rounded p-1 text-slate-400 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">{navLinks}</nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
            <div className="text-sm text-slate-500">{t(`roles.${user.role}`)}</div>
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
