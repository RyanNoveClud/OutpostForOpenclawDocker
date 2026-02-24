import type { ConnectionState, WebControlAction } from '../types';

export function getWebControlConnection(actions: WebControlAction[]): ConnectionState {
  if (!actions.length) return 'offline';
  return actions[0]?.result === 'success' ? 'online' : 'degraded';
}

export function paginateActions(actions: WebControlAction[], page: number, size: number) {
  const start = page * size;
  return actions.slice(start, start + size);
}
