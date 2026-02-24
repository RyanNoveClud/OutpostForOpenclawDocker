import { createMockAdapter, type MockResource } from './index';

function parseMockDelay(): number {
  if (typeof window === 'undefined') return 0;
  const raw = new URLSearchParams(window.location.search).get('mockDelay');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseMockFailResources(): MockResource[] {
  if (typeof window === 'undefined') return [];
  const raw = new URLSearchParams(window.location.search).get('mockFail');
  if (!raw) return [];

  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(
      (v): v is MockResource =>
        v === 'topbar' ||
        v === 'chat' ||
        v === 'dashboard' ||
        v === 'files' ||
        v === 'skills' ||
        v === 'webControl' ||
        v === 'logs' ||
        v === 'settings'
    );
}

export const mockAdapter = createMockAdapter({
  delayMs: parseMockDelay(),
  failResources: parseMockFailResources()
});
