import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { dataAdapter } from '../adapters/runtime';
import { useAppStore } from '../store';
import { appendUserMessage } from './chat-utils';
import { applyMessageToSession, getSessionPreview } from './chat-session-utils';
import type { ChatMessage, ChatSession } from '../types';
import { useI18n } from '../i18n';

export function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedChatSessionId = useAppStore((s) => s.selectedChatSessionId);
  const setSelectedChatSessionId = useAppStore((s) => s.setSelectedChatSessionId);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    dataAdapter
      .getChatSessions()
      .then((items) => {
        setSessions(items);
        const currentId = selectedChatSessionId ?? items[0]?.id ?? null;
        if (currentId) setSelectedChatSessionId(currentId);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'unknown error'));
  }, [selectedChatSessionId, setSelectedChatSessionId]);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === selectedChatSessionId) ?? sessions[0],
    [sessions, selectedChatSessionId]
  );

  const currentMessages = currentSession?.messages ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentMessages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  function patchSessionMessage(sessionId: string, messageId: string, patch: Partial<ChatMessage>) {
    setSessions((prev) =>
      prev.map((session) =>
        session.id !== sessionId
          ? session
          : {
              ...session,
              updatedAt: new Date().toISOString(),
              messages: session.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m))
            }
      )
    );
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  }

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!currentSession || sending) return;

    const now = new Date().toISOString();
    const nextMessages = appendUserMessage(currentSession.messages, draft, now);
    if (nextMessages === currentSession.messages) return;

    const text = draft.trim();
    const nextUserMessage = nextMessages[nextMessages.length - 1] as ChatMessage;
    const assistantId = `a-stream-${Date.now()}`;

    setSessions((prev) => {
      const withUser = applyMessageToSession(prev, currentSession.id, nextUserMessage, now);
      return applyMessageToSession(
        withUser,
        currentSession.id,
        {
          id: assistantId,
          role: 'assistant',
          source: 'outpost',
          streaming: true,
          content: '',
          createdAt: new Date().toISOString()
        },
        new Date().toISOString()
      );
    });

    setDraft('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/web/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession.id, message: text })
      });

      if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const row = JSON.parse(trimmed) as { type?: string; content?: string; message?: ChatMessage };

          if (row.type === 'chunk') {
            content += row.content || '';
            patchSessionMessage(currentSession.id, assistantId, { content, streaming: true, source: 'outpost' });
          }

          if (row.type === 'done' && row.message) {
            patchSessionMessage(currentSession.id, assistantId, {
              ...row.message,
              id: assistantId,
              streaming: false
            });
          }
        }
      }

      patchSessionMessage(currentSession.id, assistantId, { streaming: false });
    } catch (err) {
      patchSessionMessage(currentSession.id, assistantId, {
        streaming: false,
        source: 'system',
        content: err instanceof Error ? err.message : 'stream error'
      });
      setError(err instanceof Error ? err.message : 'stream error');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-page">
      {error ? <p className="bridge-error">Chat {t('loadFailed')}: {error}</p> : null}

      <aside className="chat-sessions">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`chat-session-item ${session.id === currentSession?.id ? 'active' : ''}`}
            onClick={() => setSelectedChatSessionId(session.id)}
          >
            <span>{session.title}</span>
            <small>{getSessionPreview(session)}</small>
          </button>
        ))}
        {!sessions.length ? <small>{t('loading')}</small> : null}
      </aside>

      <div className="chat-main">
        <div ref={listRef} className="chat-message-list">
          {currentMessages.map((message) => (
            <article key={message.id} className={`chat-message ${message.role}`}>
              <p>{message.content}</p>

              {message.card ? (
                <section className={`chat-card card-v1 card-${message.card.type || 'default'}`}>
                  <header className="chat-card-head">
                    <span className="chat-card-badge">{message.card.type || 'card'}</span>
                    <strong>{message.card.title || message.card.type}</strong>
                  </header>
                  {message.card.description ? <small>{message.card.description}</small> : null}
                  {message.card.data ? <pre>{JSON.stringify(message.card.data, null, 2)}</pre> : null}
                </section>
              ) : null}
            </article>
          ))}
          {!currentMessages.length ? <small>{t('loading')}</small> : null}
        </div>

        <form className="chat-input" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('inputPlaceholder')}
          />
          <button type="submit" disabled={sending}>{sending ? '...' : t('send')}</button>
        </form>
      </div>
    </section>
  );
}
