import { useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import type { TopbarState } from '../../types';
import { useAppStore } from '../../store';
import { useI18n } from '../../i18n';
import { dataAdapter } from '../../adapters/runtime';

type ThemeMode = 'nebula' | 'ocean' | 'mono';

const navItems = [
  { to: '/chat', key: 'chat' },
  { to: '/dashboard', key: 'dashboard' },
  { to: '/files', key: 'files' },
  { to: '/skills', key: 'skills' },
  { to: '/web-control', key: 'webControl' },
  { to: '/logs', key: 'logs' },
  { to: '/bridge-tasks', key: 'bridgeTasks' },
  { to: '/settings', key: 'settings' }
] as const;

const themeOrder: ThemeMode[] = ['nebula', 'ocean', 'mono'];

function nextTheme(current: ThemeMode): ThemeMode {
  return themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
}

function applyFavicon(theme: ThemeMode) {
  const href = `/outpost-icon-${theme}.svg`;
  const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (existing) {
    existing.href = href;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = href;
  document.head.appendChild(link);
}

function getThemeLabel(theme: ThemeMode, lang: 'zh' | 'en') {
  if (lang === 'zh') {
    if (theme === 'nebula') return '宙斯';
    if (theme === 'ocean') return '波塞冬';
    return '哈迪斯';
  }
  if (theme === 'nebula') return 'Zeus';
  if (theme === 'ocean') return 'Poseidon';
  return 'Hades';
}

export function ShellLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [topbar, setTopbar] = useState<TopbarState | null>(null);
  const theme = useAppStore((s) => s.ui.theme) as ThemeMode;
  const setUiSettings = useAppStore((s) => s.setUiSettings);
  const status = useAppStore((s) => s.connection);
  const setConnection = useAppStore((s) => s.setConnection);
  const { t, lang } = useI18n();

  useEffect(() => {
    applyFavicon(theme);
  }, [theme]);

  useEffect(() => {
    dataAdapter.getTopbarState().then((v) => {
      setTopbar(v);
      setConnection(v.connection || 'online');
    }).catch(() => {
      setTopbar(null);
    });
  }, [setConnection]);

  const statusText = useMemo(() => {
    if (status === 'online') return t('connected');
    if (status === 'degraded') return t('degraded');
    return t('offline');
  }, [status, t]);

  return (
    <div className="shell" data-theme={theme}>
      <button className="menu-toggle" onClick={() => setMenuOpen((v) => !v)} type="button">
        ☰ {t('menu')}
      </button>

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-row">
            <img src={`/outpost-icon-${theme}.svg`} alt="Outpost" className="brand-icon dynamic" />
            <h1>Outpost</h1>
          </div>
          <small>Control Console</small>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-left">
            <span className="version-chip" title={`Outpost version: ${topbar?.outpostVersion || '0.10.3'}`}>
              Outpost v{topbar?.outpostVersion || '0.10.3'}
            </span>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="theme-switch-button"
              title={getThemeLabel(theme, lang)}
              aria-label={getThemeLabel(theme, lang)}
              onClick={() => setUiSettings({ theme: nextTheme(theme) })}
            >
              {getThemeLabel(theme, lang)}
            </button>
            <span className="status-icon-wrap" title={statusText} aria-label={statusText}>
              <span className={`status-dot ${status}`} />
            </span>
          </div>
        </header>

        <section className="page-container">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
