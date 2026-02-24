import { createApiAdapter } from '../adapters/api/index.js';

function okJson(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function run() {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls < 2) throw new Error('network');
    return okJson({ outpostVersion: 'x', openclawVersion: 'y', workspacePath: '/', connection: 'online' });
  };

  const api = createApiAdapter({ baseUrl: '/api', fetchImpl, retries: 2, backoffMs: 1, timeoutMs: 50 });
  await api.getTopbarState();

  if (calls < 2) throw new Error('T28_FAIL: retry not triggered');
  console.log('T28_API_RETRY_SMOKE_PASS');
}

void run();
