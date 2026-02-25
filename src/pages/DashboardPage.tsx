import { useEffect, useMemo, useState } from 'react';
import { dataAdapter } from '../adapters/runtime';
import {
  eventLevelClass,
  getMemoryUsagePercent,
  getStatusText,
  isMetricCritical,
  sortEventsDesc
} from './dashboard-utils';
import type { DashboardEvent, DashboardMetrics, TopbarState } from '../types';
import { useI18n } from '../i18n';

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [topbar, setTopbar] = useState<TopbarState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    Promise.all([dataAdapter.getDashboardMetrics(), dataAdapter.getDashboardEvents(), dataAdapter.getTopbarState()])
      .then(([metricsData, eventsData, topbarData]) => {
        setMetrics(metricsData);
        setEvents(sortEventsDesc(eventsData));
        setTopbar(topbarData);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, []);

  const memoryPercent = useMemo(() => (metrics ? getMemoryUsagePercent(metrics) : 0), [metrics]);
  const critical = useMemo(() => (metrics ? isMetricCritical(metrics) : false), [metrics]);

  return (
    <section className="dashboard-stack">
      {error ? <p className="bridge-error">Dashboard {t('loadFailed')}: {error}</p> : null}
      <section className="dashboard-grid">
        <article className={`dashboard-card ${critical ? 'critical' : ''}`}>
          <h3>{t('openclawStatus')}</h3>
          <p>{metrics ? getStatusText(metrics.openclawStatus) : '--'}</p>
        </article>

        <article className={`dashboard-card ${metrics && metrics.cpuUsagePercent >= 85 ? 'critical' : ''}`}>
          <h3>{t('cpuUsage')}</h3>
          <p>{metrics ? `${metrics.cpuUsagePercent}%` : '--'}</p>
        </article>

        <article className="dashboard-card">
          <h3>{t('memoryUsage')}</h3>
          <p>
            {metrics ? `${metrics.memoryUsageMb} / ${metrics.memoryLimitMb} MB（${memoryPercent}%）` : '--'}
          </p>
        </article>

        <article className="dashboard-card">
          <h3>{t('activeSessions')}</h3>
          <p>{metrics ? metrics.activeSessions : '--'}</p>
        </article>

        <article className="dashboard-card">
          <h3>{t('lastHeartbeat')}</h3>
          <p>{metrics ? metrics.lastHeartbeatAt : '--'}</p>
        </article>

        <article className="dashboard-card">
          <h3>OpenClaw 版本</h3>
          <p>{topbar?.openclawVersion ? `v${topbar.openclawVersion}` : '--'}</p>
        </article>

        <article className="dashboard-card">
          <h3>项目路径</h3>
          <p className="dashboard-path">{topbar?.workspacePath || '/home/node/.openclaw/workspace'}</p>
        </article>
      </section>

      <section className="dashboard-card dashboard-timeline">
        <h3>{t('timeline')}</h3>
        {events.length === 0 ? (
          <p>{metrics ? t('noEvents') : t('loading')}</p>
        ) : (
          <ul>
            {events.map((event) => (
              <li key={event.id} className={`timeline-item ${eventLevelClass(event.level)}`}>
                <div>
                  <strong>[{event.level.toUpperCase()}]</strong> {event.message}
                </div>
                <small>
                  {event.source} · {event.createdAt}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
