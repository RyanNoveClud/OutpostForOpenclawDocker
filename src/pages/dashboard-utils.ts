import type { ConnectionState, DashboardEvent, DashboardMetrics } from '../types';

export function getStatusText(status: ConnectionState): string {
  if (status === 'online') return '运行正常';
  if (status === 'degraded') return '运行降级';
  return '运行异常';
}

export function isMetricCritical(metrics: DashboardMetrics): boolean {
  return metrics.openclawStatus === 'offline' || metrics.cpuUsagePercent >= 85;
}

export function getMemoryUsagePercent(metrics: DashboardMetrics): number {
  if (metrics.memoryLimitMb <= 0) return 0;
  return Math.min(100, Math.round((metrics.memoryUsageMb / metrics.memoryLimitMb) * 100));
}

export function sortEventsDesc(events: DashboardEvent[]): DashboardEvent[] {
  return [...events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function eventLevelClass(level: DashboardEvent['level']): string {
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warn';
  return 'info';
}
