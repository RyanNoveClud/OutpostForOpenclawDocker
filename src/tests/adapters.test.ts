import { describe, expect, it } from 'vitest';
import { createDataAdapterRuntime } from '../adapters/runtime';
import { createMockAdapter } from '../adapters/mock';

describe('adapters', () => {
  it('falls back to mock in api mode when api fails', async () => {
    const mock = createMockAdapter();
    const api = createDataAdapterRuntime({ mode: 'mock', mockAdapter: mock });
    const logs = await api.getLogs();
    expect(logs.length).toBeGreaterThan(0);
  });
});
