import { createAdminClient } from '@/lib/supabase';

export type SavedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export async function getOrCreateConversation(sessionId: string): Promise<string> {
  const db = createAdminClient();
  const { data: existing, error: selErr } = await db
    .from('conversations')
    .select('id, handed_off')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (selErr) throw new Error(`conversation lookup failed: ${selErr.message}`);
  if (existing) return existing.id;

  const { data, error } = await db
    .from('conversations')
    .insert({ session_id: sessionId })
    .select('id')
    .single();
  if (error) throw new Error(`conversation create failed: ${error.message}`);
  return data.id;
}

export async function saveMessage(
  conversationId: string,
  role: SavedMessage['role'],
  content: string
): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from('messages')
    .insert({ conversation_id: conversationId, role, content });
  if (error) throw new Error(`message insert failed: ${error.message}`);
}

// Counts consecutive trailing assistant messages that were "no-match" fallbacks.
// A turn is a "failure" if the previous assistant turn answered without FAQ context.
// For v1 we approximate: count consecutive user->assistant pairs where the assistant
// response is flagged as no-match. Simpler proxy: caller passes the flag per turn.
//
// This project tracks failure state by counting handoff-relevant signals stored
// in the conversations table. For v1, we use a lightweight approach: append a
// marker to the assistant message when it had no FAQ context, and count trailing
// markers here.

export async function countTrailingFailures(conversationId: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`history fetch failed: ${error.message}`);

  let count = 0;
  for (const m of data ?? []) {
    if (m.role !== 'assistant') continue;
    // Fallback messages are prefixed with this sentinel by the chat route.
    // We strip the sentinel before saving? No — we DON'T save the sentinel,
    // we save the assistant text as-is and use a separate mechanism.
    // For v1 simplicity: mark in the message content. Prefix is stripped client-side.
    if (m.content.startsWith('[[NOMATCH]]')) count++;
    else break;
  }
  return count;
}

export async function markHandedOff(conversationId: string): Promise<void> {
  const db = createAdminClient();

  // Read the flag BEFORE updating: skip the handoffs insert if already
  // handed off, so 3rd+ consecutive no-answer turns don't add duplicate rows.
  // The update below stays idempotent.
  let alreadyHandedOff = false;
  try {
    const { data: current, error: selError } = await db
      .from('conversations')
      .select('handed_off')
      .eq('id', conversationId)
      .single();
    if (selError) {
      console.error('chat: handoffs guard lookup failed:', selError.message);
    } else {
      alreadyHandedOff = Boolean(current?.handed_off);
    }
  } catch (e) {
    console.error(
      'chat: handoffs guard lookup failed:',
      e instanceof Error ? e.message : e
    );
  }

  const { error } = await db
    .from('conversations')
    .update({ handed_off: true })
    .eq('id', conversationId);
  if (error) throw new Error(`handoff update failed: ${error.message}`);

  if (alreadyHandedOff) return;

  // Mirror into handoffs for admin display. The conversations.handed_off
  // flag above is the source of truth; a failure here must never fail the turn.
  try {
    const { error: insError } = await db.from('handoffs').insert({
      conversation_id: conversationId,
      reason: 'Two consecutive questions outside FAQ scope',
      email: null,
    });
    if (insError) {
      console.error('chat: handoffs insert failed:', insError.message);
    }
  } catch (e) {
    console.error(
      'chat: handoffs insert failed:',
      e instanceof Error ? e.message : e
    );
  }
}

export async function isHandedOff(conversationId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('conversations')
    .select('handed_off')
    .eq('id', conversationId)
    .single();
  if (error) throw new Error(`handoff lookup failed: ${error.message}`);
  return Boolean(data?.handed_off);
}
