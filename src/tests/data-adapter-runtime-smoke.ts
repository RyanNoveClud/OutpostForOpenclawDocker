import { createDataAdapterRuntime } from '../adapters/runtime.js';
import type { DataAdapter } from '../adapters/types.js';

function createStubAdapter(tag: string): DataAdapter {
  return {
    getTopbarState: async () => ({
      outpostVersion: `${tag}-outpost`,
      openclawVersion: `${tag}-openclaw`,
      workspacePath: '/tmp',
      connection: 'online'
    }),
    getChatSessions: async () => [],
    getDashboardMetrics: async () => ({
      cpuUsagePercent: tag === 'api' ? 99 : 11,
      memoryUsageMb: 1,
      memoryLimitMb: 2,
      activeSessions: 0,
      lastHeartbeatAt: '2026-02-21T00:00:00Z',
      openclawStatus: 'online'
    }),
    getDashboardEvents: async () => [],
    getFileTree: async () => [],
    getFilePreview: async () => ({
      path: '/tmp/demo.md',
      content: tag,
      language: 'markdown',
      updatedAt: '2026-02-21T00:00:00Z'
    }),
    getSkills: async () => [],
    getWebControlActions: async () => [],
    getLogs: async () => [],
    getSettings: async () => ({
      theme: 'nebula',
      density: 'comfortable',
      refreshSeconds: 10,
      language: 'zh'
    }),
    getBridgeTasks: async () => [],
    getBridgeTaskLog: async () => [],
    getTasksOverview: async () => ({
      running: [],
      recentDone: [],
      recentFailed: [],
      stats: { total: 0, running: 0, done: 0, failed: 0, bySource: {}, cron: { totalRuns: 0, success: 0, failed: 0 } }
    })
  };
}

async function run() {
  const mock = createStubAdapter('mock');

  const apiFail: DataAdapter = {
    ...createStubAdapter('api'),
    getDashboardMetrics: async () => {
      throw new Error('api down');
    }
  };

  const apiMode = createDataAdapterRuntime({ mode: 'api', apiAdapter: apiFail, mockAdapter: mock });
  const fallbackMetrics = await apiMode.getDashboardMetrics();

  if (fallbackMetrics.cpuUsagePercent !== 11) {
    throw new Error('T10_FAIL: fallback to mock not working');
  }

  const mockMode = createDataAdapterRuntime({ mode: 'mock', apiAdapter: apiFail, mockAdapter: mock });
  const metrics = await mockMode.getDashboardMetrics();

  if (metrics.cpuUsagePercent !== 11) {
    throw new Error('T10_FAIL: mock mode selection not working');
  }

  console.log('T10_DATA_ADAPTER_RUNTIME_SMOKE_PASS');
}

void run();
