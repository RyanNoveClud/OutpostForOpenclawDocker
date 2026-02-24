import { appendUserMessage } from '../pages/chat-utils.js';

function run() {
  const base = [
    { id: 'a', role: 'assistant' as const, content: 'hello', createdAt: '2026-02-21T00:00:00Z' }
  ];

  const unchanged = appendUserMessage(base, '   ', '2026-02-21T00:00:01Z');
  if (unchanged.length !== 1) throw new Error('T12_FAIL: empty input should not append');

  const next = appendUserMessage(base, 'hi', '2026-02-21T00:00:02Z');
  if (next.length !== 2 || next[1]?.content !== 'hi' || next[1]?.role !== 'user') {
    throw new Error('T12_FAIL: send flow append failed');
  }

  console.log('T12_CHAT_UTILS_SMOKE_PASS');
}

run();
