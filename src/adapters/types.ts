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
} from '../types';

export interface UiSettings {
  theme: 'nebula' | 'ocean' | 'mono';
  density: 'comfortable' | 'compact';
  refreshSeconds: number;
  language: 'zh' | 'en';
}

export interface DataAdapter {
  getTopbarState(): Promise<TopbarState>;
  getChatSessions(): Promise<ChatSession[]>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getDashboardEvents(): Promise<DashboardEvent[]>;
  getFileTree(): Promise<FileTreeNode[]>;
  getFilePreview(): Promise<FilePreview>;
  getSkills(): Promise<SkillItem[]>;
  getWebControlActions(): Promise<WebControlAction[]>;
  getLogs(): Promise<LogEntry[]>;
  getSettings(): Promise<UiSettings>;
  getBridgeTasks(): Promise<BridgeTask[]>;
  getBridgeTaskLog(): Promise<BridgeTaskLogItem[]>;
  getTasksOverview(): Promise<TasksOverview>;
}
