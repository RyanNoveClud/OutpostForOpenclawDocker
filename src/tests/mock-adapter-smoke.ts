import { createMockAdapter } from '../adapters/mock/index.js';

async function run() {
  const normal = createMockAdapter({ delayMs: 5 });
  const [chatSessions, dashboardMetrics, fileTree, skills, actions, logs, settings] = await Promise.all([
    normal.getChatSessions(),
    normal.getDashboardMetrics(),
    normal.getFileTree(),
    normal.getSkills(),
    normal.getWebControlActions(),
    normal.getLogs(),
    normal.getSettings()
  ]);

  if (
    !chatSessions.length ||
    dashboardMetrics.cpuUsagePercent < 0 ||
    !fileTree.length ||
    !skills.length ||
    !actions.length ||
    !logs.length ||
    !settings
  ) {
    throw new Error('MOCK_SMOKE_FAIL: expected all resources to be loaded');
  }

  const failure = createMockAdapter({ failResources: ['skills'] });
  let failedAsExpected = false;
  try {
    await failure.getSkills();
  } catch {
    failedAsExpected = true;
  }

  if (!failedAsExpected) {
    throw new Error('MOCK_SMOKE_FAIL: expected simulated failure was not triggered');
  }

  console.log('T09_MOCK_ADAPTER_SMOKE_PASS');
}

void run();
