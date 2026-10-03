# Build Log

Reverse-chronological. One section per completed layer.
Each entry: date, what shipped, any decision worth remembering.
These bullets become the case study's "technical decisions" section.

## 2026-10-03 — Layer 7: Nimbus landing page

- Dark-first marketing page (zinc-950, indigo-500) with nav, hero + CSS dashboard mockup, logo strip, features, pricing, FAQ accordion, footer.
- Widget moved to `(marketing)/layout.tsx` so it persists across landing + case study but never admin.
- Pricing/FAQ copy mirrors `seed-faqs.ts` exactly — page and widget answers stay consistent (self-demonstrating RAG).
- shadcn here is Base-UI based: no `asChild` on Button (used `buttonVariants` for links), Accordion takes `value` not `type="single"`.
- `supportai:open` CustomEvent wires "Ask the AI" buttons to the widget.

## 2026-10-03 — Layer 6: Chat widget + handoff endpoint

- Built floating widget (`ChatWidget`/`ChatPanel`/`MessageBubble`/`HandoffForm`) on `useChat` + `DefaultChatTransport` from `ai`.
- `DefaultChatTransport` sends `UIMessage[]`, the route expects `[{role, content}]` — reshaped client-side via `prepareSendMessagesRequest`, route untouched.
- `POST /api/handoff` updates the pre-existing `handoffs` row (insert fallback), Resend notify is best-effort: SDK resolves `{data, error}` instead of throwing, so both paths are logged, request still 200s.
- Widget renders `data-fallback` text in place of empty tool-turn content; reasoning/tool parts hidden defensively.

## 2026-10-03 — Layer 5: Tool-call handoff signaling

- Replaced threshold-based no-answer detection with the `reportNoAnswer` tool call as the signal (junk queries scored 0.57–0.59 vs real 0.68–0.77 — too thin to threshold).
- Server-authoritative `FALLBACK_TEXT` persisted as `[[NOMATCH]] <text>` and streamed as a `data-fallback` part with `handoffReady` flag; `data-handoff` removed.
- `markHandedOff` mirrors into `handoffs` (log-only on failure); `conversations.handed_off` remains source of truth.
- gpt-oss stops after the tool call (no `execute` → single step), so tool turns stream no text — widget will render from the `data-fallback` part.

## 2026-10-03 — Layer 6 fix pass: review findings

- Panel stays mounted (CSS `hidden` toggle) so closing no longer wipes `useChat` history; request reshape reuses `data-fallback` text for tool-only turns and skips empty turns.
- `/api/handoff`: `sessionId` must be a UUID, unknown sessions return `{ok:true}` (no enumeration oracle), `reason` capped at 1000 chars, admin email link from allowlisted `APP_URL` (omitted if unset) instead of request host.

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
