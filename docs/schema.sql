-- SupportAI schema — run in the Supabase SQL editor.
-- Extension, 4 tables, match_faqs RPC, public read policy on faqs.
-- Service-role key bypasses RLS; only faqs is readable with the anon key.

create extension if not exists vector;

-- Conversations: one row per widget session.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  started_at timestamptz not null default now(),
  handed_off boolean not null default false
);

-- Messages: full turn history, including [[NOMATCH]]-prefixed fallbacks.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id),
  role text,
  content text not null,
  created_at timestamptz not null default now()
);

-- FAQs: question + answer + 768-dim Gemini embedding.
create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

-- Handoffs: one row per escalated conversation once contact is known.
create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations (id),
  email text,
  reason text,
  created_at timestamptz not null default now()
);

-- Similarity search. Takes text (pgvector text format "[0.02,-0.01,...]")
-- because PostgREST does not reliably coerce a JSON number[] into vector.
create or replace function match_faqs(
  query_embedding text,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  question text,
  answer text,
  similarity float
)
language sql stable as $$
  select
    faqs.id,
    faqs.question,
    faqs.answer,
    1 - (faqs.embedding <=> query_embedding::vector(768)) as similarity
  from faqs
  where 1 - (faqs.embedding <=> query_embedding::vector(768)) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Row-level security: locked down by default; only faqs is publicly readable.
alter table conversations enable row level security;
alter table messages enable row level security;
alter table faqs enable row level security;
alter table handoffs enable row level security;

drop policy if exists faqs_public_read on faqs;
create policy faqs_public_read on faqs for select using (true);
