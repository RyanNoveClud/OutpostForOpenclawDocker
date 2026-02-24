const DEFAULT_TIMEOUT_MS = 30000;

export class OutpostBridgeClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.OUTPOST_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
    this.token = String(options.token || process.env.OUTPOST_TOKEN || '');
    this.signature = String(options.signature || process.env.OUTPOST_BRIDGE_SIGNATURE || '');
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  }

  async install(payload = {}) {
    return await this.#post('/api/bridge/install', payload, { signed: false });
  }

  async run(payload = {}) {
    return await this.#post('/api/bridge/run', payload, { signed: true });
  }

  async result(payload = {}) {
    return await this.#post('/api/bridge/result', payload, { signed: true });
  }

  async task(taskId) {
    if (!taskId) throw new Error('taskId required');
    return await this.#get(`/api/bridge/task/${encodeURIComponent(taskId)}`);
  }

  async runAndWait(payload = {}, options = {}) {
    const pollMs = Math.max(300, Number(options.pollMs || 1000));
    const timeoutMs = Math.max(pollMs, Number(options.timeoutMs || 60000));
    const started = Date.now();

    const runResp = await this.run(payload);
    const taskId = String(runResp?.taskId || '').trim();
    if (!taskId) return runResp;

    while (Date.now() - started < timeoutMs) {
      const taskResp = await this.task(taskId);
      const status = String(taskResp?.task?.status || '');
      if (status === 'done' || status === 'error') return taskResp;
      await new Promise((r) => setTimeout(r, pollMs));
    }

    throw new Error(`runAndWait timeout: ${taskId}`);
  }

  async #get(endpoint) {
    const res = await this.#fetch(endpoint, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `request failed: ${res.status}`);
    }
    return data;
  }

  async #post(endpoint, body, { signed }) {
    const payload = { ...(body || {}) };
    if (signed && this.signature && !payload.signature) payload.signature = this.signature;

    const res = await this.#fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error || `request failed: ${res.status}`);
      err.data = data;
      throw err;
    }
    return data;
  }

  async #fetch(endpoint, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers = { ...(init.headers || {}) };
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      return await fetch(`${this.baseUrl}${endpoint}`, { ...init, headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
