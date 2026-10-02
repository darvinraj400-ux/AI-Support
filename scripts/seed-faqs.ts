// MUST be the first import. This loads .env.local as a side effect,
// before lib/supabase.ts's top-level env guard evaluates.
import './_env';

import { createAdminClient } from '../lib/supabase';
import { embedTexts } from '../lib/gemini';
import { searchFaqs } from '../lib/rag';

const FAQS = [
  {
    question: 'How much does Nimbus Analytics cost?',
    answer:
      'Three plans — Starter $19/mo (1 project, 10k events), Growth $49/mo (5 projects, 100k events), Scale $149/mo (unlimited, 1M events). All include a 14-day free trial, no credit card.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes — 14 days on every plan. No credit card to start. Upgrade, downgrade, or cancel anytime.',
  },
  {
    question: 'How do I export my data?',
    answer:
      'Settings → Data → Export. CSV or JSON. Emailed within 5 min for <1GB, download link for larger.',
  },
  {
    question: 'What integrations do you support?',
    answer:
      'Slack, Notion, Google Sheets, Zapier, webhooks. REST and GraphQL APIs. Shopify, Stripe, HubSpot on Q2 roadmap.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Full refund within 7 days of any paid charge, no questions asked. Email support@nimbusanalytics.io.',
  },
  {
    question: 'How secure is my data?',
    answer:
      'AES-256 at rest, TLS 1.3 in transit. SOC 2 Type II + GDPR compliant. Never sold or shared.',
  },
  {
    question: 'How many team members can I add?',
    answer:
      'Starter 2 seats, Growth 10 seats, Scale unlimited. Extra seats $5/mo. Settings → Team → Invite.',
  },
  {
    question: 'What happens if Nimbus goes down?',
    answer:
      '99.9% uptime SLA. status.nimbusanalytics.io. Miss SLA → 10% monthly credit automatically.',
  },
  {
    question: 'Is there an API rate limit?',
    answer:
      'Starter 60/min, Growth 300/min, Scale 1000/min. Headers included. Contact for higher.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'Settings → Billing → Cancel Plan. Access until end of billing period. No fees, no calls.',
  },
];

async function main() {
  const supabase = createAdminClient();

  console.log(`Seeding ${FAQS.length} FAQs...`);

  // Wipe existing rows (Supabase requires a filter on delete)
  const { error: delError } = await supabase
    .from('faqs')
    .delete()
    .not('id', 'is', null);
  if (delError) throw new Error(`Delete failed: ${delError.message}`);

  // Embed question + answer together so both the phrasing and the detail are searchable
  const embeddings = await embedTexts(
    FAQS.map((f) => `${f.question}\n${f.answer}`)
  );

  const rows = FAQS.map((f, i) => ({
    question: f.question,
    answer: f.answer,
    embedding: embeddings[i],
  }));

  const { error: insError } = await supabase.from('faqs').insert(rows);
  if (insError) throw new Error(`Insert failed: ${insError.message}`);

  const { count } = await supabase
    .from('faqs')
    .select('*', { count: 'exact', head: true });
  console.log(`✅ Inserted ${count} rows.`);

  // End-to-end smoke test: query through the real RAG path
  console.log('\nSmoke test: searchFaqs("How much does it cost?")');
  const matches = await searchFaqs('How much does it cost?', {
    threshold: 0.3,
    count: 3,
  });
  for (const m of matches) {
    console.log(`  ${m.similarity.toFixed(4)}  ${m.question}`);
  }
  if (matches.length === 0) {
    console.warn('⚠️  No matches returned. Check the match_faqs function and threshold.');
  } else {
    console.log(`✅ RAG path works. Top match: "${matches[0].question}"`);
  }
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
