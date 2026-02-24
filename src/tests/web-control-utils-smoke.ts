import { getWebControlConnection, paginateActions } from '../pages/web-control-utils.js';
import type { WebControlAction } from '../types/index.js';

function run() {
  const actions: WebControlAction[] = [
    { id: '1', action: 'open', target: 'a', result: 'success', createdAt: 't1' },
    { id: '2', action: 'click', target: 'b', result: 'failed', createdAt: 't2' }
  ];

  if (getWebControlConnection(actions) !== 'online') throw new Error('T21_FAIL: status map failed');
  if (paginateActions(actions, 0, 1).length !== 1 || paginateActions(actions, 1, 1)[0]?.id !== '2') {
    throw new Error('T21_FAIL: pagination failed');
  }

  console.log('T21_WEB_CONTROL_SMOKE_PASS');
}

run();
