"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageBubble, getFallbackData } from './MessageBubble';
import { HandoffForm } from './HandoffForm';

const SESSION_KEY = 'supportai_session_id';

// Math.random-based UUIDv4 for non-secure contexts (plain http:// on a
// non-localhost host) where crypto.randomUUID is unavailable. Not
// cryptographic — only a conversation correlator, and only a fallback.
function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function newSessionId(): string {
  return typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackUuid();
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Client-only: resolved in an effect so SSR never touches localStorage
  // or crypto, and server/client never disagree on the value.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | null = null;
    try {
      id = window.localStorage.getItem(SESSION_KEY);
    } catch {
      id = null;
    }
    if (!id) {
      id = newSessionId();
      try {
        window.localStorage.setItem(SESSION_KEY, id);
      } catch {
        // Storage unavailable — session stays ephemeral, chat still works.
      }
    }
    setSessionId(id);
  }, []);

  // DefaultChatTransport sends UIMessage[] ({ id, role, parts }), but
  // POST /api/chat expects { sessionId, messages: [{ role, content }]}.
  // Reshape client-side so the route contract stays untouched.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { sessionId },
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            sessionId,
            messages: messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => {
                const textParts = m.parts
                  .filter((p) => p.type === 'text')
                  .map((p) => (p as { text: string }).text)
                  .join('');
                let content = textParts;
                if (!content && m.role === 'assistant') {
                  // Tool-only turns (e.g. reportNoAnswer with no streamed
                  // text): reuse the server-authoritative fallback copy so
                  // history keeps context instead of an empty turn.
                  content = getFallbackData(m)?.text ?? '';
                }
                return { role: m.role as 'user' | 'assistant', content };
              })
              // Never send empty turns; the triggering user message always
              // has text, so the route's min(1) guarantee holds.
              .filter((m) => m.content !== ''),
          },
        }),
      }),
    [sessionId]
  );

  const { messages, sendMessage, status, regenerate } = useChat({
    transport,
  });

  const busy = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  function submit() {
    const text = input.trim();
    if (!text || busy || !sessionId) return;
    setInput('');
    void sendMessage({ text });
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const fallback = lastAssistant ? getFallbackData(lastAssistant) : null;
  const showHandoffForm = fallback?.handoffReady === true;

  const lastMessage = messages[messages.length - 1];
  const awaitingFirstToken =
    busy &&
    lastMessage?.role === 'assistant' &&
    !lastMessage.parts.some((p) => p.type === 'text');

  return (
    <motion.div
      initial={false}
      animate={
        open
          ? { opacity: 1, y: 0 }
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 16 }
      }
      transition={{ duration: 0.18 }}
      className="fixed bottom-24 right-6 z-50 flex max-h-[min(600px,calc(100vh-8rem))] w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:w-[380px]"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Nimbus Support</p>
          <p className="text-xs text-muted-foreground">Typically replies instantly</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Hi! Ask me about plans, trials, or integrations.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {awaitingFirstToken && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Typing…
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-start gap-1 px-1 text-sm">
            <p className="text-destructive">Something went wrong.</p>
            <Button variant="outline" size="sm" onClick={() => void regenerate()}>
              Retry
            </Button>
          </div>
        )}
        {showHandoffForm && sessionId && <HandoffForm sessionId={sessionId} />}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about Nimbus…"
          rows={1}
          disabled={busy || !sessionId}
          className="min-h-9 resize-none"
        />
        <Button
          onClick={submit}
          disabled={busy || !input.trim() || !sessionId}
          aria-label="Send message"
          className="bg-indigo-500 text-white hover:bg-indigo-600"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
