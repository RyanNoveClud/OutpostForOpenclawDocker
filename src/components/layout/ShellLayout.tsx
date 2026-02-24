import { useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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

export function ShellLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [topbar, setTopbar] = useState<TopbarState | null>(null);
  const [updating, setUpdating] = useState(false);
  const theme = useAppStore((s) => s.ui.theme) as ThemeMode;
  const setUiSettings = useAppStore((s) => s.setUiSettings);
  const status = useAppStore((s) => s.connection);
  const setConnection = useAppStore((s) => s.setConnection);
  const { t } = useI18n();
  const navigate = useNavigate();

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

  async function triggerUpdate() {
    if (updating) return;
    try {
      setUpdating(true);
      let res = await fetch('/api/web/system/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoRestart: true })
      });
      if (res.status === 404) {
        res = await fetch('/api/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      alert('更新脚本已执行，服务将自动重启。');
    } catch (err) {
      alert(`更新失败: ${err instanceof Error ? err.message : 'network/endpoint unavailable'}`);
    } finally {
      setUpdating(false);
    }
  }

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
            <span className={`status-dot ${status}`} />
            <span>{statusText}</span>
            <span className="workspace-chip">{topbar?.workspacePath || '/home/node/.openclaw/workspace'}</span>
          </div>

          <div className="topbar-right">
            <span className="version-chip">
              Outpost v{topbar?.outpostVersion || '0.10.3'}
              {topbar?.outpostUpdatedAt ? ` · 更新于 ${new Date(topbar.outpostUpdatedAt).toLocaleString()}` : ''}
              {' '}· OpenClaw v{topbar?.openclawVersion || '2026.2.x'}
            </span>
            <button type="button" onClick={() => setUiSettings({ theme: nextTheme(theme) })}>
              {t('theme')}：{theme === 'nebula' ? t('themeNebula') : theme === 'ocean' ? t('themeOcean') : t('themeMono')}
            </button>
            <button type="button" onClick={() => navigate('/settings')}>
              {t('settings')}
            </button>
            {topbar?.allowUpdate ? (
              <button type="button" onClick={triggerUpdate} disabled={updating}>
                {updating ? '更新中...' : '更新并重启'}
              </button>
            ) : null}
          </div>
        </header>

        <section className="page-container">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
