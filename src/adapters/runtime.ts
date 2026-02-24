import { createApiAdapter } from './api/index.js';
import { createMockAdapter, type MockResource } from './mock/index.js';
import type { DataAdapter } from './types';

export type AdapterMode = 'mock' | 'api';

interface RuntimeConfig {
  mode?: AdapterMode;
  mockDelayMs?: number;
  mockFailResources?: MockResource[];
  apiBaseUrl?: string;
  apiAdapter?: DataAdapter;
  mockAdapter?: DataAdapter;
}

function readModeFromEnv(): AdapterMode {
  const envMode = (import.meta as ImportMeta & { env?: { VITE_DATA_ADAPTER?: string } }).env
    ?.VITE_DATA_ADAPTER;
  return envMode === 'mock' ? 'mock' : 'api';
}

function readModeFromQuery(): AdapterMode | undefined {
  if (typeof window === 'undefined') return undefined;
  const queryMode = new URLSearchParams(window.location.search).get('adapter');
  if (queryMode === 'api' || queryMode === 'mock') return queryMode;
  return undefined;
}

function parseMockDelay(): number {
  if (typeof window === 'undefined') return 0;
  const raw = new URLSearchParams(window.location.search).get('mockDelay');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseMockFailResources(): MockResource[] {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('mockFail');
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(
      (v): v is MockResource =>
        v === 'topbar' ||
        v === 'chat' ||
        v === 'dashboard' ||
        v === 'files' ||
        v === 'skills' ||
        v === 'webControl' ||
        v === 'logs' ||
        v === 'settings' ||
        v === 'bridge'
    );
}

function withFallback<T extends keyof DataAdapter>(
  primary: DataAdapter,
  fallback: DataAdapter,
  key: T
): DataAdapter[T] {
  return (async () => {
    try {
      return await primary[key]();
    } catch {
      return fallback[key]();
    }
  }) as DataAdapter[T];
}

export function createDataAdapterRuntime(config?: RuntimeConfig): DataAdapter {
  const mock =
    config?.mockAdapter ??
    createMockAdapter({
      delayMs: config?.mockDelayMs ?? parseMockDelay(),
      failResources: config?.mockFailResources ?? parseMockFailResources()
    });

  const api = config?.apiAdapter ?? createApiAdapter({ baseUrl: config?.apiBaseUrl });
  const mode = config?.mode ?? readModeFromQuery() ?? readModeFromEnv();

  if (mode === 'mock') return mock;

  return {
    getTopbarState: withFallback(api, mock, 'getTopbarState'),
    getChatSessions: withFallback(api, mock, 'getChatSessions'),
    getDashboardMetrics: withFallback(api, mock, 'getDashboardMetrics'),
    getDashboardEvents: withFallback(api, mock, 'getDashboardEvents'),
    getFileTree: withFallback(api, mock, 'getFileTree'),
    getFilePreview: withFallback(api, mock, 'getFilePreview'),
    getSkills: withFallback(api, mock, 'getSkills'),
    getWebControlActions: withFallback(api, mock, 'getWebControlActions'),
    getLogs: withFallback(api, mock, 'getLogs'),
    getSettings: withFallback(api, mock, 'getSettings'),
    getBridgeTasks: withFallback(api, mock, 'getBridgeTasks'),
    getBridgeTaskLog: withFallback(api, mock, 'getBridgeTaskLog'),
    getTasksOverview: withFallback(api, mock, 'getTasksOverview')
  };
}

export const dataAdapter = createDataAdapterRuntime();
