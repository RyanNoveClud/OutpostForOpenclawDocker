import type { DataAdapter } from '../types';

interface ApiAdapterConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTheme(theme?: string): 'nebula' | 'ocean' | 'mono' {
  if (theme === 'ocean' || theme === 'mono' || theme === 'nebula') return theme;
  if (theme === 'light') return 'ocean';
  if (theme === 'dark') return 'nebula';
  return 'nebula';
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  timeoutMs: number,
  retries: number,
  backoffMs: number
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(`${baseUrl}${path}`, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`API ${path} failed: ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (i < retries) await wait(backoffMs * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`API ${path} timeout/retry exhausted: ${String(lastError)}`);
}

export function createApiAdapter(config?: ApiAdapterConfig): DataAdapter {
  const fetchImpl = config?.fetchImpl ?? fetch;
  const baseUrl = (config?.baseUrl ?? '/api').replace(/\/$/, '');
  const timeoutMs = config?.timeoutMs ?? 3000;
  const retries = config?.retries ?? 2;
  const backoffMs = config?.backoffMs ?? 400;

  const req = <T,>(path: string) => requestJson<T>(fetchImpl, baseUrl, path, timeoutMs, retries, backoffMs);

  return {
    getTopbarState: () => req('/web/topbar'),
    getChatSessions: () => req('/chat/sessions'),
    getDashboardMetrics: () => req('/web/dashboard/metrics'),
    getDashboardEvents: async () => {
      const res = await req<{ items?: unknown[] }>('/web/dashboard/events');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getFileTree: async () => {
      const res = await req<{ items?: unknown[] }>('/web/files/tree');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getFilePreview: () => req('/web/files/preview'),
    getSkills: async () => {
      const res = await req<{ items?: unknown[] }>('/web/skills');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getWebControlActions: async () => {
      const res = await req<{ items?: unknown[] }>('/web-control/actions?limit=200');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getLogs: async () => {
      const res = await req<{ items?: Array<{ id?: string; source?: 'outpost' | 'docker' | 'openclaw'; level?: 'info' | 'warn' | 'error'; message?: string; createdAt?: string }> }>('/web/dashboard/events?limit=200');
      const items = Array.isArray(res?.items) ? res.items : [];
      return items.map((item, idx) => ({
        id: item.id || `log-${idx}`,
        source: item.source || 'outpost',
        level: item.level || 'info',
        message: item.message || '',
        timestamp: item.createdAt || new Date().toISOString()
      }));
    },
    getSettings: async () => {
      const res = await req<{ theme?: 'nebula' | 'ocean' | 'mono' | 'dark' | 'light'; density?: 'comfortable' | 'compact'; refreshSeconds?: number; language?: 'zh' | 'en' }>('/web/settings');
      return {
        theme: normalizeTheme(res.theme),
        density: res.density ?? 'comfortable',
        refreshSeconds: res.refreshSeconds ?? 15,
        language: res.language ?? 'zh'
      };
    },
    getBridgeTasks: async () => {
      const res = await req<{ items?: unknown[] }>('/web/bridge/tasks?limit=200');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getBridgeTaskLog: async () => {
      const res = await req<{ items?: unknown[] }>('/web/bridge/task-log?limit=200');
      return Array.isArray(res?.items) ? (res.items as never[]) : [];
    },
    getTasksOverview: () => req('/web/tasks/overview?limit=200')
  };
}
