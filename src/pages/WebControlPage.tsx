import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { getWebControlConnection, paginateActions } from './web-control-utils';
import type { WebControlAction } from '../types';
import { useI18n } from '../i18n';

const PAGE_SIZE = 10;

const COMMAND_OPTIONS = [
  { value: '', label: '选择命令模板（可选）' },
  { value: 'help', label: 'help' },
  { value: 'ping', label: 'ping' },
  { value: 'attach http://127.0.0.1:9222', label: 'attach <cdpUrl>' },
  { value: 'split https://example.com', label: 'split <url>' },
  { value: 'split_here', label: 'split_here' },
  { value: 'target bot', label: 'target <control|bot>' },
  { value: 'targets', label: 'targets' },
  { value: 'open https://example.com', label: 'open <url>' },
  { value: 'navigate https://example.com', label: 'navigate <url>' },
  { value: 'list 50', label: 'list [N]' },
  { value: 'click #selector', label: 'click <selector>' },
  { value: 'type #selector hello', label: 'type <selector> <text>' },
  { value: 'typen 1 hello', label: 'typen <序号> <text>' },
  { value: 'typetext 搜索 hello', label: 'typetext <文本片段> <text>' },
  { value: 'select #selector value', label: 'select <selector> <value>' },
  { value: 'clickn 1', label: 'clickn <序号>' },
  { value: 'highlightn 1', label: 'highlightn <序号>' },
  { value: 'clicktext 登录', label: 'clicktext <文本片段>' },
  { value: 'highlighttext 登录', label: 'highlighttext <文本片段>' },
  { value: 'highlight #selector', label: 'highlight <selector>' },
  { value: 'title', label: 'title' },
  { value: 'screenshot', label: 'screenshot' }
];

type ActionRow = WebControlAction & {
  source?: string;
  channel?: string;
  durationMs?: number;
  error?: string;
  data?: unknown;
};

function parseJsonSafe(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function shortText(text: string, max = 240) {
  const s = (text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export function WebControlPage() {
  const { t } = useI18n();
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [page, setPage] = useState(0);
  const [command, setCommand] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  async function loadActions() {
    const res = await fetch('/api/web-control/actions?limit=200');
    const text = await res.text();
    const json = parseJsonSafe(text) as { ok?: boolean; items?: ActionRow[]; error?: string };
    if (!res.ok) {
      throw new Error(`加载日志失败 HTTP ${res.status}: ${json?.error || shortText(text) || 'empty response'}`);
    }
    setActions(Array.isArray(json?.items) ? json.items : []);
  }

  useEffect(() => {
    loadActions().catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
    const timer = setInterval(() => {
      loadActions().catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  async function onSendCommand(e: FormEvent) {
    e.preventDefault();
    const text = command.trim();
    if (!text || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/web-control/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: text })
      });
      const raw = await res.text();
      const json = parseJsonSafe(raw) as { ok?: boolean; error?: string; data?: unknown };
      if (!res.ok) {
        throw new Error(`执行失败 HTTP ${res.status}: ${json?.error || shortText(raw) || 'empty response'}`);
      }
      if (!json?.ok) throw new Error(json?.error || `执行失败: ${shortText(raw) || 'unknown'}`);
      setLastResult(json?.data ?? null);
      setCommand('');
      await loadActions();
    } catch (err) {
      setLastResult(null);
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setRunning(false);
    }
  }

  const connection = useMemo(() => getWebControlConnection(actions), [actions]);
  const pageActions = useMemo<ActionRow[]>(
    () => paginateActions(actions, page, PAGE_SIZE) as ActionRow[],
    [actions, page]
  );
  const totalPages = Math.max(1, Math.ceil(actions.length / PAGE_SIZE));

  return (
    <section className="web-control-wrap">
      <article className="dashboard-card">
        <h3>{t('browserControlStatus')}</h3>
        <p>{connection}</p>
      </article>

      <article className="dashboard-card">
        <h3>{t('commandConsole')}</h3>
        <small>{t('attachHint')}</small>
        <form className="web-command-form" onSubmit={onSendCommand}>
          <select
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value);
              if (e.target.value) setCommand(e.target.value);
            }}
          >
            {COMMAND_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t('commandPlaceholder')}
          />
          <button type="submit" disabled={running}>{running ? t('runing') : t('sendCommand')}</button>
        </form>
        {error ? <p className="bridge-error">{error}</p> : null}
        {lastResult ? <pre>{JSON.stringify(lastResult, null, 2)}</pre> : null}
      </article>

      <article className="dashboard-card web-actions">
        <h3>{t('actionLogs')}</h3>
        <div className="web-actions-list">
          {pageActions.map((action) => (
            <div key={action.id} className={`web-action-item ${action.result}`}>
              <strong>{action.action}</strong> · {action.target}
              <small>
                {action.result} · {action.createdAt} · {action.source || '-'} · {action.channel || '-'}
                {typeof action.durationMs === 'number' ? ` · ${action.durationMs}ms` : ''}
              </small>
              {action.error ? <small className="bridge-error">error: {action.error}</small> : null}
              {action.data ? <pre>{JSON.stringify(action.data, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
        <div className="web-actions-pager">
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))}>{t('prevPage')}</button>
          <span>{page + 1}/{totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>{t('nextPage')}</button>
        </div>
      </article>
    </section>
  );
}
