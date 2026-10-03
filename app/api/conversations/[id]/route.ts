import { isAdminRequest } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const db = createAdminClient();
  const { data, error } = await db
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('admin conversation messages failed:', error.message);
    return Response.json({ error: 'List failed' }, { status: 500 });
  }
  return Response.json({ messages: data ?? [] });
}
