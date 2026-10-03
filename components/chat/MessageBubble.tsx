"use client";

import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';

export type FallbackData = {
  text: string;
  handoffReady: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getFallbackData(message: UIMessage): FallbackData | null {
  const part = message.parts.find((p) => p.type === 'data-fallback');
  if (!part || !isRecord(part) || !('data' in part)) return null;
  const data = part.data;
  if (!isRecord(data)) return null;
  if (typeof data.text !== 'string') return null;
  if (typeof data.handoffReady !== 'boolean') return null;
  return { text: data.text, handoffReady: data.handoffReady };
}

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('');
}

export function MessageBubble({ message }: { message: UIMessage }) {
  const fallback = getFallbackData(message);
  // data-fallback carries the server-authoritative copy; the streamed text
  // on tool turns is empty, so prefer it whenever present.
  const text = fallback ? fallback.text : getMessageText(message);
  if (!text) return null;

  const isUser = message.role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] break-words px-3.5 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-2xl rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-bl-sm bg-muted text-foreground'
        )}
      >
        {text}
      </div>
    </div>
  );
}
