import { useEffect, useState } from 'react';
import { dataAdapter } from '../adapters/runtime';
import { useAppStore } from '../store';
import { loadUiSettings, saveUiSettings } from './settings-utils';
import type { UiSettings } from '../adapters';
import { useI18n } from '../i18n';

interface UpdateStatus {
  ok?: boolean;
  state?: 'idle' | 'running' | 'done' | 'error' | string;
  phase?: string;
  text?: string;
  percent?: number;
  error?: string | null;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UiSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateScript, setUpdateScript] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle', phase: 'idle', text: '等待更新', percent: 0 });
  const ui = useAppStore((s) => s.ui);
  const setUiSettings = useAppStore((s) => s.setUiSettings);
  const { t } = useI18n();

  useEffect(() => {
    dataAdapter
      .getSettings()
      .then((result) => {
        const local = loadUiSettings();
        const merged = { ...result, ...local };
        setSettings(merged);
        setUiSettings(merged);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, [setUiSettings]);

  useEffect(() => {
    saveUiSettings(ui);
  }, [ui]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch('/api/web/system/update-status');
        const json = await res.json().catch(() => ({}));
        if (!stopped && res.ok && json) {
          setUpdateStatus({
            state: json.state || 'idle',
            phase: json.phase || 'idle',
            text: json.text || '等待更新',
            percent: Number.isFinite(Number(json.percent)) ? Number(json.percent) : 0,
            error: json.error || null
          });
        }
      } catch {
        // ignore poll errors
      } finally {
        if (!stopped) timer = setTimeout(tick, 1000);
      }
    };

    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function runAutoUpdate() {
    if (updating) return;
    try {
      setUpdating(true);
      setUpdateStatus({ state: 'running', phase: 'prepare', text: '准备更新...', percent: 5, error: null });
      let res = await fetch('/api/web/system/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoRestart: true, branch: updateScript.trim() || 'main' })
      });
      if (res.status === 404) {
        res = await fetch('/api/update', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cmd: `git -C '/home/node/.openclaw/workspace' pull --ff-only origin ${updateScript.trim() || 'main'}` })
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
              onChange={(e) => setUiSettings({ theme: e.target.value as UiSettings['theme'] })}
            >
              <option value="nebula">Nebula</option>
              <option value="ocean">Ocean</option>
              <option value="mono">Mono</option>
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
        <h3>自动更新</h3>
        <div className="skills-actions" style={{ display: 'grid', gap: 8 }}>
          <label>
            更新分支（可选）
            <input
              type="text"
              placeholder="默认 main"
              value={updateScript}
              onChange={(e) => setUpdateScript(e.target.value)}
            />
          </label>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span>{updateStatus.text || '等待更新'}</span>
              <span>{Math.max(0, Math.min(100, Number(updateStatus.percent || 0)))}%</span>
            </div>
            <div style={{ width: '100%', height: 10, background: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, Number(updateStatus.percent || 0)))}%`,
                  height: '100%',
                  background: updateStatus.state === 'error' ? '#ef4444' : '#22c55e',
                  transition: 'width 240ms ease'
                }}
              />
            </div>
            {updateStatus.error ? <small style={{ color: '#ef4444' }}>{updateStatus.error}</small> : null}
          </div>
          <button type="button" onClick={runAutoUpdate} disabled={updating || updateStatus.state === 'running'}>
            {updating || updateStatus.state === 'running' ? '更新中...' : '执行更新并自动重启'}
          </button>
        </div>
      </article>
    </section>
  );
}
