import { useEffect, useState } from 'react';
import { dataAdapter } from '../adapters/runtime';
import { useAppStore } from '../store';
import type { UiSettings } from '../adapters';
import { useI18n } from '../i18n';

export function SettingsPage() {
  const [settings, setSettings] = useState<UiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateScript, setUpdateScript] = useState('');
  const ui = useAppStore((s) => s.ui);
  const setUiSettings = useAppStore((s) => s.setUiSettings);
  const { t } = useI18n();

  useEffect(() => {
    dataAdapter
      .getSettings()
      .then((result) => {
        setSettings(result);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  async function runAutoUpdate() {
    if (updating) return;
    try {
      setUpdating(true);
      let res = await fetch('/api/web/system/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoRestart: true, cmd: updateScript.trim() || undefined })
      });
      if (res.status === 404) {
        res = await fetch('/api/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cmd: updateScript.trim() || undefined })
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

  if (error) return <h2>Settings ({t('loadFailed')}: {error})</h2>;
  if (!settings) return <h2>Settings ({t('loading')})</h2>;

  return (
    <section className="skills-wrap">
      <article className="dashboard-card">
        <h3>{t('settingsCenter')}</h3>
        <div className="skills-actions">
          <label>
            {t('theme')}
            <select
              value={ui.theme}
              onChange={(e) => {
                const nextTheme = e.target.value as UiSettings['theme'];
                console.debug('[settings] theme change', { from: ui.theme, to: nextTheme });
                setUiSettings({ theme: nextTheme });
              }}
            >
              <option value="nebula">{t('themeNebula')}</option>
              <option value="ocean">{t('themeOcean')}</option>
              <option value="mono">{t('themeMono')}</option>
            </select>
          </label>
          <label>
            {t('density')}
            <select
              value={ui.density}
              onChange={(e) => setUiSettings({ density: e.target.value as UiSettings['density'] })}
            >
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>
          <label>
            {t('refreshSeconds')}
            <input
              type="number"
              min={5}
              max={120}
              value={ui.refreshSeconds}
              onChange={(e) => setUiSettings({ refreshSeconds: Number(e.target.value) || 15 })}
            />
          </label>
          <label>
            {t('language')}
            <select
              value={ui.language}
              onChange={(e) => setUiSettings({ language: e.target.value as UiSettings['language'] })}
            >
              <option value="zh">{t('chinese')}</option>
              <option value="en">{t('english')}</option>
            </select>
          </label>
        </div>
      </article>

      <article className="dashboard-card" style={{ marginTop: 12 }}>
        <h3>自动更新脚本</h3>
        <div className="skills-actions" style={{ display: 'grid', gap: 8 }}>
          <label>
            自定义脚本（可选）
            <input
              type="text"
              placeholder="留空则使用 scripts/auto-update.sh"
              value={updateScript}
              onChange={(e) => setUpdateScript(e.target.value)}
            />
          </label>
          <button type="button" onClick={runAutoUpdate} disabled={updating}>
            {updating ? '更新中...' : '执行更新并自动重启'}
          </button>
        </div>
      </article>
    </section>
  );
}
