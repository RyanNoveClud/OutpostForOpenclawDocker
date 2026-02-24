import type {
  ChatSession,
  DashboardEvent,
  DashboardMetrics,
  FilePreview,
  FileTreeNode,
  LogEntry,
  SkillItem,
  TopbarState,
  WebControlAction,
  BridgeTask,
  BridgeTaskLogItem,
  TasksOverview
} from '../../types';
import type { DataAdapter, UiSettings } from '../types';

export type MockResource =
  | 'topbar'
  | 'chat'
  | 'dashboard'
  | 'files'
  | 'skills'
  | 'webControl'
  | 'logs'
  | 'settings'
  | 'bridge';

export type MockUiSettings = UiSettings;

export interface MockConfig {
  delayMs?: number;
  failResources?: MockResource[];
}

const now = '2026-02-21T05:01:00Z';

const mockTopbar: TopbarState = {
  outpostVersion: '0.10.3-mock',
  openclawVersion: '2026.2.x-mock',
  workspacePath: '/home/node/.openclaw/workspace',
  connection: 'online',
  outpostUpdatedAt: now,
  allowUpdate: true,
  hasRefreshControl: false,
  hasConnectionToggle: false,
  hasUiSettingsShortcut: false
};

const mockChatSessions: ChatSession[] = [
  {
    id: 'chat-1',
    title: 'Outpost 控制台规划',
    updatedAt: now,
    messages: [
      { id: 'm-1', role: 'user', content: '先把路由和布局打好', createdAt: '2026-02-21T01:40:00Z' },
      {
        id: 'm-2',
        role: 'assistant',
        source: 'outpost',
        content: '收到，按任务拆分推进并逐项自测。',
        createdAt: '2026-02-21T01:41:00Z',
        card: {
          type: 'status',
          title: '执行计划',
          description: '已切分任务并进入逐项实现与自测。',
          data: { stage: 'implementation', owner: 'outpost' }
        }
      }
    ]
  }
];

const mockDashboardMetrics: DashboardMetrics = {
  cpuUsagePercent: 22,
  memoryUsageMb: 512,
  memoryLimitMb: 2048,
  activeSessions: 3,
  lastHeartbeatAt: now,
  openclawStatus: 'online'
};

const mockDashboardEvents: DashboardEvent[] = [
  {
    id: 'evt-1',
    level: 'info',
    source: 'outpost',
    message: 'T08 类型契约已通过构建验证。',
    createdAt: '2026-02-21T02:27:00Z'
  },
  {
    id: 'evt-2',
    level: 'warn',
    source: 'openclaw',
    message: 'API Adapter 尚未接入，当前运行在 mock 模式。',
    createdAt: '2026-02-21T04:55:00Z'
  }
];

const mockFileTree: FileTreeNode[] = [
  {
    id: 'node-src',
    name: 'src',
    path: 'outpost/src',
    type: 'directory',
    children: [
      { id: 'node-pages', name: 'pages', path: 'outpost/src/pages', type: 'directory' },
      { id: 'node-adapters', name: 'adapters', path: 'outpost/src/adapters', type: 'directory' }
    ]
  }
];

const mockFilePreview: FilePreview = {
  path: 'outpost/IMPLEMENTATION_PLAN.md',
  language: 'markdown',
  updatedAt: now,
  content: '# Mock Preview\n\n- 当前任务：T09\n- 状态：DOING'
};

const mockSkills: SkillItem[] = [
  {
    name: 'outpost-bridge',
    version: '0.1.0',
    source: 'openclaw',
    status: 'installed',
    updatedAt: now
  },
  {
    name: 'qqbot-cron',
    version: '1.2.0',
    source: 'outpost',
    status: 'update-available',
    updatedAt: '2026-02-20T10:00:00Z'
  }
];

const mockWebControlActions: WebControlAction[] = [
  {
    id: 'wc-1',
    action: 'open',
    target: 'https://docs.openclaw.ai',
    result: 'success',
    createdAt: '2026-02-21T04:40:00Z'
  }
];

const mockLogs: LogEntry[] = [
  {
    id: 'log-1',
    source: 'outpost',
    level: 'info',
    message: 'Mock adapter initialized.',
    timestamp: now
  },
  {
    id: 'log-2',
    source: 'docker',
    level: 'warn',
    message: 'Using mock data path.',
    timestamp: now
  }
];

const mockSettings: MockUiSettings = {
  theme: 'nebula',
  density: 'comfortable',
  refreshSeconds: 15,
  language: 'zh'
};

const mockBridgeTasks: BridgeTask[] = [
  {
    taskId: 'run-1740102000-a1b2c3',
    kind: 'run',
    status: 'done',
    runner: 'openclaw-plan',
    source: 'openclaw-orchestrator-loop',
    createdAt: '2026-02-21T08:39:00Z',
    updatedAt: '2026-02-21T08:39:18Z'
  },
  {
    taskId: 'run-1740102100-d4e5f6',
    kind: 'run',
    status: 'error',
    runner: 'outpost-shell',
    source: 'openclaw',
    error: 'shell disabled',
    createdAt: '2026-02-21T08:41:00Z',
    updatedAt: '2026-02-21T08:41:05Z'
  },
  {
    taskId: 'install-1740102200-g7h8i9',
    kind: 'install',
    status: 'running',
    source: 'outpost',
    slug: 'computer-use',
    version: 'latest',
    createdAt: '2026-02-21T08:43:00Z',
    updatedAt: '2026-02-21T08:43:04Z'
  }
];

const mockBridgeTaskLog: BridgeTaskLogItem[] = [
  {
    ts: '2026-02-21T08:39:01Z',
    taskId: 'run-1740102000-a1b2c3',
    kind: 'run',
    phase: 'start',
    runner: 'openclaw-plan',
    source: 'openclaw-orchestrator-loop'
  },
  {
    ts: '2026-02-21T08:39:18Z',
    taskId: 'run-1740102000-a1b2c3',
    kind: 'run',
    phase: 'done',
    runner: 'openclaw-plan'
  },
  {
    ts: '2026-02-21T08:41:05Z',
    taskId: 'run-1740102100-d4e5f6',
    kind: 'run',
    phase: 'error',
    runner: 'outpost-shell',
    error: 'shell disabled'
  }
];

const mockTasksOverview: TasksOverview = {
  running: mockBridgeTasks.filter((x) => x.status === 'running' || x.status === 'queued'),
  recentDone: mockBridgeTasks.filter((x) => x.status === 'done'),
  recentFailed: mockBridgeTasks.filter((x) => x.status === 'error'),
  stats: {
    total: mockBridgeTasks.length,
    running: mockBridgeTasks.filter((x) => x.status === 'running' || x.status === 'queued').length,
    done: mockBridgeTasks.filter((x) => x.status === 'done').length,
    failed: mockBridgeTasks.filter((x) => x.status === 'error').length,
    bySource: {
      'openclaw-chat': 1,
      'outpost-ui': 1,
      'channel:napcat': 1
    },
    cron: {
      totalRuns: 0,
      success: 0,
      failed: 0
    }
  }
};

function wait(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withScenario<T>(
  resource: MockResource,
  config: Required<MockConfig>,
  value: T
): Promise<T> {
  await wait(config.delayMs);
  if (config.failResources.includes(resource)) {
    throw new Error(`[mock] ${resource} resource simulated failure`);
  }
  return value;
}

function normalizeConfig(config?: MockConfig): Required<MockConfig> {
  return {
    delayMs: config?.delayMs ?? 0,
    failResources: config?.failResources ?? []
  };
}

export function createMockAdapter(config?: MockConfig): DataAdapter {
  const normalized = normalizeConfig(config);

  return {
    getTopbarState: () => withScenario('topbar', normalized, mockTopbar),
    getChatSessions: () => withScenario('chat', normalized, mockChatSessions),
    getDashboardMetrics: () => withScenario('dashboard', normalized, mockDashboardMetrics),
    getDashboardEvents: () => withScenario('dashboard', normalized, mockDashboardEvents),
    getFileTree: () => withScenario('files', normalized, mockFileTree),
    getFilePreview: () => withScenario('files', normalized, mockFilePreview),
    getSkills: () => withScenario('skills', normalized, mockSkills),
    getWebControlActions: () => withScenario('webControl', normalized, mockWebControlActions),
    getLogs: () => withScenario('logs', normalized, mockLogs),
    getSettings: () => withScenario('settings', normalized, mockSettings),
    getBridgeTasks: () => withScenario('bridge', normalized, mockBridgeTasks),
    getBridgeTaskLog: () => withScenario('bridge', normalized, mockBridgeTaskLog),
    getTasksOverview: () => withScenario('bridge', normalized, mockTasksOverview)
  };
}

export type MockAdapter = ReturnType<typeof createMockAdapter>;
