import type { ChatMessage, ChatSession } from '../types';

export function applyMessageToSession(
  sessions: ChatSession[],
  sessionId: string,
  message: ChatMessage,
  updatedAt: string
): ChatSession[] {
  return sessions.map((session) =>
    session.id === sessionId
      ? { ...session, updatedAt, messages: [...session.messages, message] }
      : session
  );
}

export function getSessionPreview(session: ChatSession): string {
  const last = session.messages[session.messages.length - 1];
  return last?.content ?? '暂无消息';
}
