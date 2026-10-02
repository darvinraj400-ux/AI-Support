# Build Log

Reverse-chronological. One section per completed layer.
Each entry: date, what shipped, any decision worth remembering.
These bullets become the case study's "technical decisions" section.

## 2026-10-02 — Layer 4: Provider stack flip

- Switched primary LLM to Groq `openai/gpt-oss-120b`, fallback to Gemini `gemini-3.1-flash-lite`.
- Reason: Gemini free tier is 20 req/day on current Flash models (measured, not documented), and 2.0-flash is retired. Groq free tier has no such ceiling and sub-second latency.
- Added `thinkingBudget: 0` to Gemini calls — cut turn latency from 7min to under 20s before the swap.
- Discovered `ListModels` shows *existence*, not *entitlement* — several models listed that hard-fail at call time.

## Prior layers (backfill summary)

- **Layer 1 — Scaffold**: Next.js 15 App Router, TS, Tailwind v4, shadcn/ui, 22 stub files, env layout.
- **Layer 2 — DB + RAG**: Supabase pgvector, `match_faqs` RPC, Gemini 768-dim embeddings, seed script with smoke test.
  - Bug: PostgREST silently nulls vector RPC args when passed as `number[]`. Fixed by sending `JSON.stringify(embedding)` (text format) and changing the RPC arg to `text` with a cast to `vector(768)` inside the function.
  - Bug: RLS default-deny on `faqs` blocked anon reads. Added `faqs_public_read` policy. Other three tables intentionally remain RLS-locked + service_role-only.
- **Layer 3 — Chat API**: streaming route, conversation persistence, `[[NOMATCH]]` sentinel, handoff counter, Groq fallback.
  - Bug: `gemini-2.0-flash` retired mid-project. Moved to 3.8-flash, then to Groq after quota issues.
