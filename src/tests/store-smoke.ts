import { useAppStore } from '../store/app-store.js';

function run() {
  useAppStore.setState({
    connection: 'online',
    selectedChatSessionId: null,
    ui: { theme: 'nebula', density: 'comfortable', refreshSeconds: 15, language: 'zh' },
    logsFilter: { source: 'all', level: 'all', keyword: '' }
  });

  useAppStore.getState().setConnection('degraded');
  useAppStore.getState().setSelectedChatSessionId('chat-1');
  useAppStore.getState().setUiSettings({ theme: 'ocean' });
  useAppStore.getState().setLogsFilter({ source: 'docker', level: 'warn' });

  const state = useAppStore.getState();
  if (state.connection !== 'degraded') throw new Error('T11_FAIL: connection not updated');
  if (state.selectedChatSessionId !== 'chat-1') throw new Error('T11_FAIL: session not updated');
  if (state.ui.theme !== 'ocean') throw new Error('T11_FAIL: ui not updated');
  if (state.logsFilter.source !== 'docker' || state.logsFilter.level !== 'warn') {
    throw new Error('T11_FAIL: logs filter not updated');
  }

  console.log('T11_STORE_SMOKE_PASS');
}

run();
