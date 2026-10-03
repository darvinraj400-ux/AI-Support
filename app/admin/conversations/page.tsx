import {
  ConversationList,
  type ConversationRow,
} from '@/components/admin/ConversationList';
import { createAdminClient } from '@/lib/supabase';

export default async function AdminConversationsPage() {
  const db = createAdminClient();
  const { data: convs } = await db
    .from('conversations')
    .select('id, session_id, started_at, handed_off')
    .order('started_at', { ascending: false })
    .limit(50);

  let rows: ConversationRow[] = [];
  if (convs && convs.length > 0) {
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
    rows = convs.map((c) => ({
      ...c,
      session_id: c.session_id.slice(0, 8),
      message_count: counts[c.id] ?? 0,
      has_contact: contacted.has(c.id),
    }));
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-white">Conversations</h1>
      <ConversationList initialConversations={rows} />
    </div>
  );
}
