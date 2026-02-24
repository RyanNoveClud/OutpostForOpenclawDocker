import { applyMessageToSession, getSessionPreview } from '../pages/chat-session-utils.js';
import type { ChatSession } from '../types/index.js';

function run() {
  const base: ChatSession[] = [
    {
      id: 's1',
      title: 'A',
      updatedAt: '2026-02-21T00:00:00Z',
      messages: [{ id: 'm1', role: 'assistant', content: 'hello', createdAt: '2026-02-21T00:00:00Z' }]
    },
    {
      id: 's2',
      title: 'B',
      updatedAt: '2026-02-21T00:00:00Z',
      messages: [{ id: 'm2', role: 'assistant', content: 'world', createdAt: '2026-02-21T00:00:00Z' }]
    }
  ];

  const next = applyMessageToSession(base, 's1', {
    id: 'u1',
    role: 'user',
    content: 'new-msg',
    createdAt: '2026-02-21T00:01:00Z'
  }, '2026-02-21T00:01:00Z');

  if (next[0]?.messages.length !== 2 || next[1]?.messages.length !== 1) {
    throw new Error('T13_FAIL: session isolation broken');
  }

  const preview = getSessionPreview(next[0]);
  if (preview !== 'new-msg') {
    throw new Error('T13_FAIL: session preview not updated');
  }

  console.log('T13_CHAT_SESSION_UTILS_SMOKE_PASS');
}

run();
