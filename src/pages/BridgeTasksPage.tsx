import { useEffect, useMemo, useState } from 'react';
import { virtualSlice } from './logs-utils';
import { dataAdapter } from '../adapters/runtime';
import type { BridgeTask, BridgeTaskLogItem, TasksOverview } from '../types';
import { useI18n } from '../i18n';

const PAGE_SIZE = 100;

type StatusFilter = 'all' | 'running' | 'done' | 'error';
type KindFilter = 'all' | 'install' | 'run' | 'result';

function normalizeStatus(task: BridgeTask): 'running' | 'done' | 'error' {
  if (task.status === 'done') return 'done';
  if (task.status === 'error') return 'error';
  return 'running';
}

function timeOf(task: BridgeTask) {
  return Date.parse(String(task.updatedAt || task.createdAt || '1970-01-01T00:00:00Z'));
}

export function BridgeTasksPage() {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<BridgeTask[]>([]);
  const [taskLogs, setTaskLogs] = useState<BridgeTaskLogItem[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<TasksOverview | null>(null);

  useEffect(() => {
    Promise.all([dataAdapter.getTasksOverview(), dataAdapter.getBridgeTaskLog()])
      .then(([ov, logs]) => {
        setOverview(ov);
        const merged = [
          ...(ov?.running || []),
          ...(ov?.recentDone || []),
          ...(ov?.recentFailed || [])
        ];
        setTasks(merged);
        setTaskLogs(Array.isArray(logs) ? logs : []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  const sorted = useMemo(() => [...tasks].sort((a, b) => timeOf(b) - timeOf(a)), [tasks]);

  const filtered = useMemo(() => {
    return sorted.filter((task) => {
      const statusPass = status === 'all' || normalizeStatus(task) === status;
      const kindPass = kind === 'all' || task.kind === kind;
      const text = `${task.taskName || ''} ${task.taskId} ${task.runner || ''} ${task.source || ''} ${task.error || ''} ${task.slug || ''}`.toLowerCase();
      const keywordPass = !keyword || text.includes(keyword.toLowerCase());
      return statusPass && kindPass && keywordPass;
    });
  }, [sorted, status, kind, keyword]);

  const virtualTasks = useMemo(() => virtualSlice(filtered, offset, PAGE_SIZE), [filtered, offset]);

  const counters = useMemo(() => {
    if (overview?.stats) {
      return {
        total: overview.stats.total,
        running: overview.stats.running,
        done: overview.stats.done,
        failed: overview.stats.failed
      };
    }
    const running = sorted.filter((t) => normalizeStatus(t) === 'running').length;
    const done = sorted.filter((t) => normalizeStatus(t) === 'done').length;
    const failed = sorted.filter((t) => normalizeStatus(t) === 'error').length;
    return { total: sorted.length, running, done, failed };
  }, [sorted, overview]);

  const latestLogs = useMemo(() => [...taskLogs].slice(-8).reverse(), [taskLogs]);

  if (error) return <h2>Tasks ({t('loadFailed')}: {error})</h2>;

  return (
    <section className="bridge-wrap">
      <section className="bridge-kpi-grid">
        <article className="dashboard-card">
          <h3>{t('totalTasks')}</h3>
          <p>{counters.total}</p>
        </article>
        <article className="dashboard-card">
          <h3>{t('running')}</h3>
          <p>{counters.running}</p>
        </article>
        <article className="dashboard-card">
          <h3>{t('done')}</h3>
          <p>{counters.done}</p>
        </article>
        <article className="dashboard-card critical">
          <h3>{t('failed')}</h3>
          <p>{counters.failed}</p>
        </article>
      </section>

      {overview?.stats?.cron ? (
        <section className="bridge-kpi-grid">
          <article className="dashboard-card">
            <h3>定时任务总执行</h3>
            <p>{overview.stats.cron.totalRuns}</p>
          </article>
          <article className="dashboard-card">
            <h3>定时任务成功</h3>
            <p>{overview.stats.cron.success}</p>
          </article>
          <article className="dashboard-card critical">
            <h3>定时任务失败</h3>
            <p>{overview.stats.cron.failed}</p>
          </article>
        </section>
      ) : null}

      {overview?.stats?.bySource ? (
        <article className="dashboard-card">
          <h3>来源统计</h3>
          <div className="bridge-log-list">
            {Object.entries(overview.stats.bySource).map(([source, count]) => (
              <div key={source} className="bridge-log-item">
                <strong>{source}</strong>
                <small>{count}</small>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="logs-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">status: all</option>
          <option value="running">status: running</option>
          <option value="done">status: done</option>
          <option value="error">status: error</option>
        </select>

        <select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)}>
          <option value="all">kind: all</option>
          <option value="install">kind: install</option>
          <option value="run">kind: run</option>
          <option value="result">kind: result</option>
        </select>

        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('keywordSearch')} />
      </div>

      {!filtered.length ? (
        <p>{t('noResult')}</p>
      ) : (
        <div className="bridge-task-list">
          {virtualTasks.map((task) => {
            const normalized = normalizeStatus(task);
            return (
              <article key={task.taskId} className={`bridge-task-item ${normalized}`}>
                <div className="bridge-task-head">
                  <strong>{task.taskName || task.taskId}</strong>
                  <span className={`badge ${normalized === 'done' ? 'done' : normalized === 'error' ? 'todo' : 'partial'}`}>
                    {normalized}
                  </span>
                </div>
                <small>
                  {task.kind} · {task.runner || '-'} · {task.source || '-'}
                </small>
                {task.taskName ? <small>ID: {task.taskId}</small> : null}
                {task.slug ? <small>skill: {task.slug} {task.version ? `@${task.version}` : ''}</small> : null}
                <small>
                  进度: {typeof task.progressPercent === 'number' ? `${task.progressPercent}%` : '-'}
                  {' '}· 阶段: {task.stage || '-'}
                  {' '}· 剩余约: {typeof task.progressPercent === 'number' ? `${Math.max(0, 100 - task.progressPercent)}%` : '-'}
                </small>
                {task.error ? <p className="bridge-error">{task.error}</p> : null}
                <small>
                  {t('created')}: {task.createdAt || '-'}
                  <br />
                  {t('updated')}: {task.updatedAt || '-'}
                </small>
              </article>
            );
          })}
        </div>
      )}

      <div className="web-actions-pager">
        <button type="button" onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}>
          {t('prevChunk')}
        </button>
        <span>
          {offset + 1}-{Math.min(filtered.length, offset + PAGE_SIZE)} / {filtered.length}
        </span>
        <button type="button" onClick={() => setOffset((v) => Math.min(Math.max(0, filtered.length - PAGE_SIZE), v + PAGE_SIZE))}>
          {t('nextChunk')}
        </button>
      </div>

      <article className="dashboard-card">
        <h3>{t('recentTaskLogs')}</h3>
        {!latestLogs.length ? (
          <p>{t('noLogs')}</p>
        ) : (
          <div className="bridge-log-list">
            {latestLogs.map((row, idx) => (
              <div key={`${row.taskId || 'unknown'}-${idx}`} className="bridge-log-item">
                <strong>{row.phase || '-'}</strong> · {row.kind || '-'} · {row.taskId || '-'}
                <small>{row.runner || '-'} · {row.ts || '-'}</small>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
