import type {
  ChatSession,
  DashboardMetrics,
  FileTreeNode,
  LogEntry,
  SkillItem,
  TopbarState,
  WebControlAction
} from '../types';

const validChatSession: ChatSession = {
  id: 'session-1',
  title: 'Outpost Chat',
  updatedAt: new Date().toISOString(),
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'hello',
      createdAt: new Date().toISOString()
    }
  ]
};

const validMetrics: DashboardMetrics = {
  cpuUsagePercent: 12,
  memoryUsageMb: 330,
  memoryLimitMb: 2048,
  activeSessions: 3,
  lastHeartbeatAt: new Date().toISOString(),
  openclawStatus: 'online'
};

const validTreeNode: FileTreeNode = {
  id: 'n1',
  name: 'workspace',
  path: '/home/node/.openclaw/workspace',
  type: 'directory',
  children: []
};

const validSkill: SkillItem = {
  name: 'frontend-design',
  version: '1.0.0',
  source: 'openclaw',
  status: 'installed',
  updatedAt: new Date().toISOString()
};

const validLog: LogEntry = {
  id: 'log-1',
  source: 'outpost',
  level: 'info',
  message: 'boot ok',
  timestamp: new Date().toISOString()
};

const validAction: WebControlAction = {
  id: 'act-1',
  action: 'navigate',
  target: 'https://example.com',
  result: 'success',
  createdAt: new Date().toISOString()
};

const validTopbar: TopbarState = {
  outpostVersion: '0.10.3',
  openclawVersion: '2026.2.x',
  workspacePath: '/home/node/.openclaw/workspace',
  connection: 'degraded'
};

const invalidChat: ChatSession = {
  ...validChatSession,
  messages: [
    {
      id: 'm2',
      // @ts-expect-error invalid role should fail
      role: 'bot',
      content: 'x',
      createdAt: new Date().toISOString()
    }
  ]
};

const invalidSkill: SkillItem = {
  ...validSkill,
  // @ts-expect-error invalid status should fail
  status: 'unknown'
};

void validChatSession;
void validMetrics;
void validTreeNode;
void validSkill;
void validLog;
void validAction;
void validTopbar;
void invalidChat;
void invalidSkill;
