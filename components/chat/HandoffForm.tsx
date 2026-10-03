"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SUBMITTED_KEY = 'supportai_handoff_submitted';

function readSubmitted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SUBMITTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function HandoffForm({ sessionId }: { sessionId: string }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState<boolean>(readSubmitted);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          email,
          reason: reason.trim() ? reason : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
        );
      }
      setSubmitted(true);
      try {
        window.localStorage.setItem(SUBMITTED_KEY, '1');
      } catch {
        // Storage unavailable — confirmation still shows for this session.
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-foreground">
        Thanks — we&rsquo;ll be in touch at {email || 'your email'}.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border bg-background p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handoff-email">Email</Label>
        <Input
          id="handoff-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={sending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handoff-reason">Details (optional)</Label>
        <Textarea
          id="handoff-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Anything else we should know?"
          rows={2}
          disabled={sending}
        />
      </div>
      <Button type="submit" disabled={sending || !email.trim()}>
        {sending ? 'Sending…' : 'Send to human'}
      </Button>
    </form>
  );
}
