import { FaqTable, type FaqRow } from '@/components/admin/FaqTable';
import { createAdminClient } from '@/lib/supabase';

export default async function AdminFaqsPage() {
  const db = createAdminClient();
  const { data } = await db
    .from('faqs')
    .select('id, question, answer, created_at')
    .order('created_at', { ascending: false });
  const faqs = (data ?? []) as FaqRow[];
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-white">FAQs</h1>
      <FaqTable initialFaqs={faqs} />
    </div>
  );
}
