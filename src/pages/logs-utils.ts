import type { LogEntry } from '../types';
import type { LogsFilterState } from '../store';

export function filterLogs(logs: LogEntry[], filter: LogsFilterState): LogEntry[] {
  return logs.filter((log) => {
    const sourceOk = filter.source === 'all' || log.source === filter.source;
    const levelOk = filter.level === 'all' || log.level === filter.level;
    const keywordOk = !filter.keyword || log.message.toLowerCase().includes(filter.keyword.toLowerCase());
    return sourceOk && levelOk && keywordOk;
  });
}

export function virtualSlice<T>(items: T[], offset: number, limit: number): T[] {
  if (limit <= 0) return [];
  return items.slice(offset, offset + limit);
}
