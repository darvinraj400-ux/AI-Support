import { isAdminRequest } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = createAdminClient();
  const { data: convs, error } = await db
    .from('conversations')
    .select('id, session_id, started_at, handed_off')
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('admin conversations list failed:', error.message);
    return Response.json({ error: 'List failed' }, { status: 500 });
  }
  if (!convs || convs.length === 0) {
    return Response.json({ conversations: [] });
  }

  const ids = convs.map((c) => c.id);
  const [{ data: msgs }, { data: hands }] = await Promise.all([
    db.from('messages').select('conversation_id').in('conversation_id', ids),
    db
      .from('handoffs')
      .select('conversation_id, email')
      .in('conversation_id', ids),
  ]);

  const counts: Record<string, number> = Object.fromEntries(
    ids.map((id) => [id, 0])
  );
  for (const m of msgs ?? []) {
    counts[m.conversation_id] = (counts[m.conversation_id] ?? 0) + 1;
  }
  const contacted = new Set(
    (hands ?? [])
      .filter((h) => h.email != null)
      .map((h) => h.conversation_id)
  );

  return Response.json({
    conversations: convs.map((c) => ({
      ...c,
      session_id: c.session_id.slice(0, 8),
      message_count: counts[c.id] ?? 0,
      has_contact: contacted.has(c.id),
    })),
  });
}
