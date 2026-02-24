import { memo, useEffect, useMemo, useState } from 'react';
import { dataAdapter } from '../adapters/runtime';
import { useAppStore } from '../store';
import { filterLogs, virtualSlice } from './logs-utils';
import type { LogEntry } from '../types';
import { useI18n } from '../i18n';

const PAGE_SIZE = 200;

const LogsList = memo(function LogsList({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="logs-list">
      {logs.map((log) => (
        <div key={log.id} className={`logs-item ${log.level}`}>
          <strong>[{log.level}]</strong> {log.message}
          <small>
            {log.source} · {log.timestamp}
          </small>
        </div>
      ))}
    </div>
  );
});

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const logsFilter = useAppStore((s) => s.logsFilter);
  const setLogsFilter = useAppStore((s) => s.setLogsFilter);
  const { t } = useI18n();

  useEffect(() => {
    let closed = false;

    async function pull() {
      try {
        const rows = await dataAdapter.getLogs();
        if (!closed) {
          setLogs(rows);
          setError(null);
        }
      } catch (err: unknown) {
        if (!closed) setError(err instanceof Error ? err.message : 'unknown error');
      }
    }

    pull();
    const timer = setInterval(pull, 3000);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => filterLogs(logs, logsFilter), [logs, logsFilter]);
  const virtualLogs = useMemo(() => virtualSlice(filtered, offset, PAGE_SIZE), [filtered, offset]);

  return (
    <section className="logs-wrap">
      {error ? <p className="bridge-error">Logs {t('loadFailed')}: {error}</p> : null}

      <div className="logs-filters">
        <select
          value={logsFilter.source}
          onChange={(e) => setLogsFilter({ source: e.target.value as typeof logsFilter.source })}
        >
          <option value="all">all</option>
          <option value="outpost">outpost</option>
          <option value="docker">docker</option>
          <option value="openclaw">openclaw</option>
        </select>

        <select
          value={logsFilter.level}
          onChange={(e) => setLogsFilter({ level: e.target.value as typeof logsFilter.level })}
        >
          <option value="all">all</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>

        <input
          value={logsFilter.keyword}
          onChange={(e) => setLogsFilter({ keyword: e.target.value })}
          placeholder={t('keywordSearch')}
        />
      </div>

      {!filtered.length ? <p>{t('noResult')}</p> : <LogsList logs={virtualLogs} />}

      <div className="web-actions-pager">
        <button type="button" onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}>
          {t('prevChunk')}
        </button>
        <span>
          {offset + 1}-{Math.min(filtered.length, offset + PAGE_SIZE)} / {filtered.length}
        </span>
        <button
          type="button"
          onClick={() => setOffset((v) => Math.min(Math.max(0, filtered.length - PAGE_SIZE), v + PAGE_SIZE))}
        >
          {t('nextChunk')}
        </button>
      </div>
    </section>
  );
}
