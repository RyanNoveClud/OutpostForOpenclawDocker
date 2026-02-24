import { useEffect, useMemo, useState } from 'react';
import type { SkillItem } from '../types';
import { useI18n } from '../i18n';

type SkillTab = 'outpost' | 'openclaw';

type RunResult = {
  ok?: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  command?: string;
  slug?: string;
  source?: string;
};

type RowFeedback = {
  kind: 'success' | 'error';
  text: string;
  detail?: unknown;
};

function parseJsonSafe(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function SkillsPage() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tab, setTab] = useState<SkillTab>('outpost');
  const [error, setError] = useState<string | null>(null);
  const [runningSkill, setRunningSkill] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [searchSource, setSearchSource] = useState<'outpost' | 'openclaw'>('outpost');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{ slug: string; version?: string; raw?: string; installed?: boolean; score?: number }[]>([]);
  const [searchPanelOpen, setSearchPanelOpen] = useState(true);

  async function loadSkills() {
    const res = await fetch('/api/web/skills');
    const raw = await res.text();
    const json = parseJsonSafe(raw) as { ok?: boolean; items?: SkillItem[]; error?: string };
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `加载技能失败 HTTP ${res.status}`);
    }
    setSkills(Array.isArray(json?.items) ? json.items : []);
  }

  useEffect(() => {
    loadSkills().catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  const grouped = useMemo(
    () => ({
      outpost: skills.filter((s) => s.source === 'outpost'),
      openclaw: skills.filter((s) => s.source === 'openclaw')
    }),
    [skills]
  );
  const current = grouped[tab];

  const recommended = useMemo(() => {
    return [...searchResult]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 6);
  }, [searchResult]);

  async function runSkillTest(skill: SkillItem) {
    const key = `${skill.source}:${skill.name}`;
    setRunningSkill(key);
    try {
      const res = await fetch('/api/web/skills/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: skill.source, slug: skill.name, cmd: 'pwd' })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as RunResult;
      if (!res.ok || !json?.ok) {
        setRowFeedback((prev) => ({
          ...prev,
          [key]: { kind: 'error', text: json?.error || `HTTP ${res.status}`, detail: json }
        }));
      } else {
        setRowFeedback((prev) => ({
          ...prev,
          [key]: { kind: 'success', text: t('oneClickTestSuccess'), detail: json }
        }));
      }
    } catch (err) {
      setRowFeedback((prev) => ({
        ...prev,
        [key]: { kind: 'error', text: err instanceof Error ? err.message : 'unknown error' }
      }));
    } finally {
      setRunningSkill(null);
    }
  }

  async function doSkillAction(skill: SkillItem, action: 'update' | 'enable' | 'disable' | 'uninstall') {
    const key = `${skill.source}:${skill.name}`;
    try {
      const res = await fetch('/api/web/skills/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: skill.source, slug: skill.name, action })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        setRowFeedback((prev) => ({ ...prev, [key]: { kind: 'error', text: json?.error || `HTTP ${res.status}`, detail: json } }));
        return;
      }
      if (action === 'uninstall') {
        setSkills((prev) => prev.filter((s) => !(s.source === skill.source && s.name === skill.name)));
      } else {
        await loadSkills();
      }
      setRowFeedback((prev) => ({ ...prev, [key]: { kind: 'success', text: `${action} 成功`, detail: json } }));
    } catch (err) {
      setRowFeedback((prev) => ({ ...prev, [key]: { kind: 'error', text: err instanceof Error ? err.message : 'unknown error' } }));
    }
  }

  async function refreshAllSkillStatus() {
    setRefreshingAll(true);
    setError(null);
    setRowFeedback({});
    try {
      const res = await fetch('/api/web/skills/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `整体刷新失败 HTTP ${res.status}`);
      }
      await loadSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setRefreshingAll(false);
    }
  }

  async function searchSkills() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch('/api/web/skills/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: searchSource, query: searchQuery.trim() })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; error?: string; stdout?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const installedSet = new Set(
        skills.filter((s) => s.source === searchSource).map((s) => String(s.name).toLowerCase())
      );

      const rows = String(json.stdout || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^([a-z0-9-_]+)\s+v([^\s]+)/i);
          const scoreMatch = line.match(/\(([0-9.]+)\)\s*$/);
          const slug = m?.[1] || line.split(' ')[0];
          return {
            slug,
            version: m?.[2],
            raw: line,
            installed: installedSet.has(String(slug).toLowerCase()),
            score: scoreMatch ? Number(scoreMatch[1]) : undefined
          };
        });
      setSearchResult(rows.slice(0, 20));
      if (rows.length) setSearchPanelOpen(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSearching(false);
    }
  }

  async function installSkill(slug: string, version?: string) {
    const key = `${searchSource}:${slug}`;
    setInstallingKey(key);
    setSearchError(null);
    try {
      const res = await fetch('/api/web/skills/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: searchSource, slug, version: version || '' })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setSearchResult((prev) => prev.map((r) => (r.slug === slug ? { ...r, installed: true } : r)));
      await loadSkills();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setInstallingKey(null);
    }
  }

  return (
    <section className="skills-wrap">
      {error ? <p className="bridge-error">Skills {t('loadFailed')}: {error}</p> : null}
      <article className="dashboard-card">
        <h3>{t('skillSearchInstall')}</h3>
        <div className="skills-actions">
          <select value={searchSource} onChange={(e) => setSearchSource(e.target.value as 'outpost' | 'openclaw')}>
            <option value="outpost">outpost</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('searchPlaceholder')} />
          <button type="button" onClick={searchSkills} disabled={searching}>{searching ? t('searching') : t('search')}</button>
        </div>
        {searchError ? <small style={{ color: '#ef4444' }}>{searchError}</small> : null}
        {recommended.length ? (
          <article className="dashboard-card" style={{ marginTop: 10 }}>
            <div className="skills-actions" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{t('recommendedSkills')}</h3>
              <button type="button" onClick={() => setSearchPanelOpen((v) => !v)}>
                {searchPanelOpen ? t('collapseSearch') : t('expandSearch')}
              </button>
            </div>
            {searchPanelOpen ? (
              <ul className="skills-list" style={{ marginTop: 10 }}>
                {recommended.map((row) => (
                  <li key={`rec-${row.slug}-${row.version || 'na'}`} className="skills-item">
                    <div>
                      <strong>{row.slug}</strong>
                      <small>
                        {row.version ? `v${row.version}` : t('unknownVersion')} · score: {row.score ?? '-'} · {row.installed ? t('installed') : t('notInstalled')}
                      </small>
                    </div>
                    <div className="skills-actions">
                      <button
                        type="button"
                        onClick={() => installSkill(row.slug, row.version)}
                        disabled={installingKey === `${searchSource}:${row.slug}` || row.installed}
                      >
                        {row.installed ? t('installed') : installingKey === `${searchSource}:${row.slug}` ? t('installing') : `${t('installTo')} ${searchSource}`}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}


      </article>

      <div className="skills-tabs">
        <button type="button" className={tab === 'outpost' ? 'active' : ''} onClick={() => setTab('outpost')}>
          {t('outpostSkills')}（{grouped.outpost.length}）
        </button>
        <button type="button" className={tab === 'openclaw' ? 'active' : ''} onClick={() => setTab('openclaw')}>
          {t('openclawSkills')}（{grouped.openclaw.length}）
        </button>
        <button type="button" onClick={refreshAllSkillStatus} disabled={refreshingAll}>
          {refreshingAll ? t('refreshingAll') : t('refreshAllStatus')}
        </button>
      </div>

      <ul className="skills-list">
        {!current.length ? <small>{t('loading')}</small> : null}
        {current.map((skill) => {
          const key = `${skill.source}:${skill.name}`;
          const fb = rowFeedback[key];
          return (
            <li key={key} className="skills-item" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <strong>{skill.name}</strong>
                  <small>
                    <span className={`skill-status-dot ${skill.status === 'disabled' ? 'off' : 'on'}`} />
                    {skill.status === 'disabled' ? t('disabled') : t('enabled')} · v{skill.version} · {skill.source}
                  </small>
                </div>
                <div className="skills-actions">
                  <button type="button" onClick={() => doSkillAction(skill, 'update')}>{t('update')}</button>
                  {skill.status === 'disabled' ? (
                    <button type="button" onClick={() => doSkillAction(skill, 'enable')}>{t('enable')}</button>
                  ) : (
                    <button type="button" onClick={() => doSkillAction(skill, 'disable')}>{t('disable')}</button>
                  )}
                  <button type="button" onClick={() => doSkillAction(skill, 'uninstall')}>{t('uninstall')}</button>
                  <button type="button" onClick={() => runSkillTest(skill)} disabled={runningSkill === key}>
                    {runningSkill === key ? t('testing') : t('oneClickTest')}
                  </button>
                </div>
              </div>
              {fb ? (
                <div style={{ marginTop: 8 }}>
                  <small style={{ color: fb.kind === 'error' ? '#ef4444' : '#22c55e' }}>{fb.text}</small>
                  {fb.detail ? <pre>{JSON.stringify(fb.detail, null, 2)}</pre> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
