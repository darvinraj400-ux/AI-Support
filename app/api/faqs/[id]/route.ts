import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin-auth';
import { embedTexts } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase';

const FaqPatchSchema = z
  .object({
    question: z.string().min(3).max(500).optional(),
    answer: z.string().min(3).max(2000).optional(),
  })
  .refine((v) => v.question !== undefined || v.answer !== undefined, {
    message: 'Nothing to update',
  });

const ROW_COLUMNS = 'id, question, answer, created_at';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = FaqPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  const { data: existing, error: selErr } = await db
    .from('faqs')
    .select('id, question, answer')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('admin faq lookup failed:', selErr.message);
    return Response.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const question = parsed.data.question ?? existing.question;
  const answer = parsed.data.answer ?? existing.answer;
  const changed =
    question !== existing.question || answer !== existing.answer;

  const update: { question: string; answer: string; embedding?: number[] } = {
    question,
    answer,
  };
  if (changed) {
    try {
      const [embedding] = await embedTexts([`${question}\n${answer}`]);
      update.embedding = embedding;
    } catch (e) {
      console.error('admin faq re-embed failed:', e);
      return Response.json({ error: 'Embedding failed' }, { status: 500 });
    }
  }

  const { data, error } = await db
    .from('faqs')
    .update(update)
    .eq('id', id)
    .select(ROW_COLUMNS)
    .single();
  if (error) {
    console.error('admin faq update failed:', error.message);
    return Response.json({ error: 'Update failed' }, { status: 500 });
  }
  return Response.json({ faq: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const db = createAdminClient();
  const { error } = await db.from('faqs').delete().eq('id', id);
  if (error) {
    console.error('admin faq delete failed:', error.message);
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
