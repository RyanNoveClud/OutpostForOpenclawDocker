import type { ChatMessage } from '../types';

export function appendUserMessage(messages: ChatMessage[], content: string, nowIso: string): ChatMessage[] {
  const text = content.trim();
  if (!text) return messages;

  return [
    ...messages,
    {
      id: `user-${messages.length + 1}`,
      role: 'user',
      source: 'user',
      content: text,
      createdAt: nowIso
    }
  ];
}
