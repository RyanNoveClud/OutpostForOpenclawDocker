import { create } from 'zustand';
import type { ConnectionState } from '../types';

export interface UiSettingsState {
  theme: 'nebula' | 'ocean' | 'mono';
  density: 'comfortable' | 'compact';
  refreshSeconds: number;
  language: 'zh' | 'en';
}

export interface LogsFilterState {
  source: 'all' | 'outpost' | 'docker' | 'openclaw';
  level: 'all' | 'info' | 'warn' | 'error';
  keyword: string;
}

interface AppStoreState {
  connection: ConnectionState;
  selectedChatSessionId: string | null;
  ui: UiSettingsState;
  logsFilter: LogsFilterState;
  setConnection: (connection: ConnectionState) => void;
  setSelectedChatSessionId: (sessionId: string | null) => void;
  setUiSettings: (patch: Partial<UiSettingsState>) => void;
  setLogsFilter: (patch: Partial<LogsFilterState>) => void;
}

export const defaultUiSettings: UiSettingsState = {
  theme: 'nebula',
  density: 'comfortable',
  refreshSeconds: 15,
  language: 'zh'
};

export const defaultLogsFilter: LogsFilterState = {
  source: 'all',
  level: 'all',
  keyword: ''
};

export const useAppStore = create<AppStoreState>((set) => ({
  connection: 'online',
  selectedChatSessionId: null,
  ui: defaultUiSettings,
  logsFilter: defaultLogsFilter,
  setConnection: (connection) => set({ connection }),
  setSelectedChatSessionId: (selectedChatSessionId) => set({ selectedChatSessionId }),
  setUiSettings: (patch) => set((state) => ({ ui: { ...state.ui, ...patch } })),
  setLogsFilter: (patch) => set((state) => ({ logsFilter: { ...state.logsFilter, ...patch } }))
}));
