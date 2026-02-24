import {
  eventLevelClass,
  getMemoryUsagePercent,
  getStatusText,
  isMetricCritical,
  sortEventsDesc
} from '../pages/dashboard-utils.js';
import type { DashboardEvent, DashboardMetrics } from '../types/index.js';

function run() {
  const normal: DashboardMetrics = {
    cpuUsagePercent: 22,
    memoryUsageMb: 512,
    memoryLimitMb: 2048,
    activeSessions: 2,
    lastHeartbeatAt: '2026-02-21T05:30:00Z',
    openclawStatus: 'online'
  };

  const degraded: DashboardMetrics = { ...normal, openclawStatus: 'degraded', cpuUsagePercent: 88 };
  const events: DashboardEvent[] = [
    {
      id: 'e1',
      level: 'warn',
      source: 'outpost',
      message: 'warn msg',
      createdAt: '2026-02-21T05:00:00Z'
    },
    {
      id: 'e2',
      level: 'info',
      source: 'openclaw',
      message: 'info msg',
      createdAt: '2026-02-21T05:10:00Z'
    }
  ];

  if (getStatusText(normal.openclawStatus) !== '运行正常') throw new Error('T14_FAIL: status text map');
  if (getMemoryUsagePercent(normal) !== 25) throw new Error('T14_FAIL: memory percent calc');
  if (!isMetricCritical(degraded)) throw new Error('T14_FAIL: critical highlight check');
  if (sortEventsDesc(events)[0]?.id !== 'e2') throw new Error('T15_FAIL: timeline order desc failed');
  if (eventLevelClass('warn') !== 'warn') throw new Error('T15_FAIL: level style mapping failed');

  console.log('T15_DASHBOARD_TIMELINE_SMOKE_PASS');
}

run();
