import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createAdminClient } from '@/lib/supabase';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function AdminPage() {
  const db = createAdminClient();

  const [{ count: faqCount }, { count: convCount }, { count: msgCount }] =
    await Promise.all([
      db.from('faqs').select('*', { count: 'exact', head: true }),
      db.from('conversations').select('*', { count: 'exact', head: true }),
      db.from('messages').select('*', { count: 'exact', head: true }),
    ]);

  // Handoffs pending: handed_off=true with NO handoffs row carrying an email.
  const [{ data: handedOff }, { data: contacted }] = await Promise.all([
    db.from('conversations').select('id').eq('handed_off', true),
    db.from('handoffs').select('conversation_id').not('email', 'is', null),
  ]);
  const contactedIds = new Set((contacted ?? []).map((r) => r.conversation_id));
  const pendingCount = (handedOff ?? []).filter(
    (r) => !contactedIds.has(r.id)
  ).length;

  const { data: recent } = await db
    .from('conversations')
    .select('id, session_id, started_at, handed_off')
    .order('started_at', { ascending: false })
    .limit(5);

  const stats = [
    { label: 'Total FAQs', value: faqCount ?? 0 },
    { label: 'Conversations', value: convCount ?? 0 },
    { label: 'Handoffs pending', value: pendingCount },
    { label: 'Messages', value: msgCount ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-zinc-800 bg-zinc-900">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-zinc-400">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-white">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent conversations</h2>
          <Link
            href="/admin/conversations"
            className="text-sm text-indigo-400 underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>
        {!recent || recent.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
            No conversations yet. Open the widget on the landing page to generate one.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Session</TableHead>
                  <TableHead className="text-zinc-400">Started</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((c) => (
                  <TableRow key={c.id} className="border-zinc-800">
                    <TableCell className="font-mono text-xs text-zinc-300">
                      {c.session_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {timeAgo(c.started_at)}
                    </TableCell>
                    <TableCell>
                      {c.handed_off ? (
                        <Badge className="border-indigo-500/40 bg-indigo-500/15 text-indigo-300">
                          Handed off
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-zinc-700 text-zinc-400"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
