"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConversationRow = {
  id: string;
  session_id: string;
  started_at: string;
  handed_off: boolean;
  message_count: number;
  has_contact: boolean;
};

type ThreadMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusOf(c: ConversationRow): {
  label: string;
  className: string;
} {
  if (c.has_contact)
    return {
      label: 'Contacted',
      className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    };
  if (c.handed_off)
    return {
      label: 'Handed off',
      className: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
    };
  return {
    label: 'Active',
    className: 'border-zinc-700 text-zinc-400',
  };
}

export function ConversationList({
  initialConversations,
}: {
  initialConversations: ConversationRow[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadMessage[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (threads[id]) return;
    setLoading(id);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data as { error?: string } | null)?.error ??
            `Request failed (${res.status})`
        );
      }
      setThreads((prev) => ({
        ...prev,
        [id]: ((data as { messages?: ThreadMessage[] }).messages ?? []),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load thread.');
      setExpanded(null);
    } finally {
      setLoading(null);
    }
  }

  if (initialConversations.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
        No conversations yet. Open the widget on the landing page to generate one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {initialConversations.map((c) => {
        const status = statusOf(c);
        const isOpen = expanded === c.id;
        return (
          <div
            key={c.id}
            className={cn(
              'rounded-xl border border-zinc-800 bg-zinc-900',
              c.handed_off && 'border-l-2 border-l-indigo-500'
            )}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="font-mono text-xs text-zinc-300">
                {c.session_id}…
              </span>
              <span className="text-xs text-zinc-500">{timeAgo(c.started_at)}</span>
              <span className="text-xs text-zinc-500">
                {c.message_count} messages
              </span>
              <Badge variant="outline" className={status.className}>
                {status.label}
              </Badge>
              <span className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void toggle(c.id)}
                  className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  {isOpen ? 'Hide' : loading === c.id ? 'Loading…' : 'View'}
                </Button>
              </span>
            </div>
            {isOpen && (
              <div className="flex flex-col gap-2 border-t border-zinc-800 px-4 py-3">
                {(threads[c.id] ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'self-end rounded-br-sm bg-indigo-500 text-white'
                        : 'self-start rounded-bl-sm bg-zinc-800 text-zinc-100'
                    )}
                  >
                    {m.content.replace(/^\[\[NOMATCH\]\]\s?/, '')}
                  </div>
                ))}
                {loading === c.id && (
                  <p className="text-sm text-zinc-500">Loading thread…</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
