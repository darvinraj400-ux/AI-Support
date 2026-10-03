import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin-auth';
import { embedTexts } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase';

const FaqSchema = z.object({
  question: z.string().min(3).max(500),
  answer: z.string().min(3).max(2000),
});

const ROW_COLUMNS = 'id, question, answer, created_at';

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from('faqs')
    .select(ROW_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('admin faqs list failed:', error.message);
    return Response.json({ error: 'List failed' }, { status: 500 });
  }
  return Response.json({ faqs: data ?? [] });
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = FaqSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { question, answer } = parsed.data;

  let embedding: number[];
  try {
    [embedding] = await embedTexts([`${question}\n${answer}`]);
  } catch (e) {
    console.error('admin faq embed failed:', e);
    return Response.json({ error: 'Embedding failed' }, { status: 500 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('faqs')
    .insert({ question, answer, embedding })
    .select(ROW_COLUMNS)
    .single();
  if (error) {
    console.error('admin faq insert failed:', error.message);
    return Response.json({ error: 'Insert failed' }, { status: 500 });
  }
  return Response.json({ faq: data }, { status: 201 });
}
