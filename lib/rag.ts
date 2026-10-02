import { createServerClient } from '@/lib/supabase';
import { embedText } from '@/lib/gemini';

export type FaqMatch = {
  id: string;
  question: string;
  answer: string;
  similarity: number;
};

export async function searchFaqs(
  query: string,
  opts: { threshold?: number; count?: number } = {}
): Promise<FaqMatch[]> {
  const { threshold = 0.5, count = 5 } = opts;

  const embedding = await embedText(query);
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('match_faqs', {
    // PostgREST does not reliably coerce a JS number[] into vector(768).
    // Send the pgvector text format ("[1,2,3]") so the text->vector cast fires.
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: count,
  });

  if (error) {
    throw new Error(`match_faqs RPC failed: ${error.message}`);
  }

  return (data ?? []) as FaqMatch[];
}
