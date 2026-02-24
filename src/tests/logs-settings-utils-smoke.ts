import { filterLogs, virtualSlice } from '../pages/logs-utils.js';
import { loadUiSettings } from '../pages/settings-utils.js';
import type { LogEntry } from '../types/index.js';

function run() {
  const logs: LogEntry[] = [
    { id: '1', source: 'outpost', level: 'info', message: 'hello', timestamp: 't1' },
    { id: '2', source: 'docker', level: 'error', message: 'boom', timestamp: 't2' }
  ];

  const filtered = filterLogs(logs, { source: 'docker', level: 'error', keyword: 'bo' });
  if (filtered.length !== 1 || filtered[0]?.id !== '2') throw new Error('T22_FAIL: filter failed');
  if (virtualSlice(logs, 1, 1)[0]?.id !== '2') throw new Error('T26_FAIL: virtual slice failed');
  if (typeof loadUiSettings() !== 'object') throw new Error('T24_FAIL: load settings failed');

  console.log('T22_T24_T26_UTILS_SMOKE_PASS');
}

run();
