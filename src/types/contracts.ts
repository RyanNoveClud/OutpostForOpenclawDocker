export type ConnectionState = 'online' | 'degraded' | 'offline';

export interface ChatMessageCard {
  type: string;
  title?: string;
  description?: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  source?: 'outpost' | 'openclaw' | 'user' | 'system';
  streaming?: boolean;
  card?: ChatMessageCard;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface DashboardMetrics {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  activeSessions: number;
  lastHeartbeatAt: string;
  openclawStatus: ConnectionState;
}

export interface DashboardEvent {
  id: string;
  level: 'info' | 'warn' | 'error';
  source: 'outpost' | 'docker' | 'openclaw';
  message: string;
  createdAt: string;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface FilePreview {
  path: string;
  content: string;
  language: 'text' | 'json' | 'markdown' | 'log';
  updatedAt: string;
}

export interface SkillItem {
  name: string;
  version: string;
  source: 'outpost' | 'openclaw';
  status: 'installed' | 'disabled' | 'update-available';
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  source: 'outpost' | 'docker' | 'openclaw';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface WebControlAction {
  id: string;
  action: string;
  target: string;
  result: 'success' | 'failed';
  createdAt: string;
}

export interface TopbarState {
  outpostVersion: string;
  openclawVersion: string;
  workspacePath: string;
  connection: ConnectionState;
  outpostUpdatedAt?: string;
  allowUpdate?: boolean;
  hasRefreshControl?: boolean;
  hasConnectionToggle?: boolean;
  hasUiSettingsShortcut?: boolean;
}

export interface BridgeTask {
  taskId: string;
  taskName?: string;
  kind: 'install' | 'run' | 'result' | 'task' | string;
  status: 'queued' | 'running' | 'done' | 'error' | 'retry_wait' | string;
  runner?: string;
  source?: string;
  slug?: string;
  version?: string | null;
  createdAt?: string;
  updatedAt?: string;
  error?: string | null;
  stage?: string;
  progressPercent?: number;
  result?: unknown;
}

export interface BridgeTaskLogItem {
  taskId?: string;
  kind?: string;
  phase?: string;
  runner?: string;
  source?: string;
  slug?: string;
  version?: string | null;
  error?: string;
  ts?: string;
}

export interface TasksOverview {
  running: BridgeTask[];
  recentDone: BridgeTask[];
  recentFailed: BridgeTask[];
  stats: {
    total: number;
    running: number;
    done: number;
    failed: number;
    bySource: Record<string, number>;
    cron: {
      totalRuns: number;
      success: number;
      failed: number;
    };
  };
}
