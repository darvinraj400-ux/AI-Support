# Build Log

Reverse-chronological. One section per completed layer.
Each entry: date, what shipped, any decision worth remembering.
These bullets become the case study's "technical decisions" section.

## 2026-10-10 — Layer B-Artifact: physical Intelligence Core

- Core rebuilt as a physical artifact, not a wireframe: night-HDRI image-based lighting (drei `Environment preset="night"`), `FogExp2` depth, a `MeshTransmissionMaterial` glass shell, `metalness:1.0` clearcoat rings, a brighter core (1.2 idle → 3.5 think peak) with a hard white inner sphere, soft radial-sprite particles, drei `Trail` motion streaks on the fastest particles, a pointer-parallax + idle-drift camera, and a Bloom → ChromaticAberration → Vignette → Noise post stack on a tier/stage degradation ladder.
- Deliberate deviations, each documented in code: **DepthOfField omitted** — its mask shader writes alpha from the circle-of-confusion, so transparent pixels become opaque and would destroy the hero's CSS radial glow (Section 9), and its `focalLength` prop is deprecated in postprocessing 6.39.5 (silently becomes a world-space `focusRange`); **`Environment preset` wrapped in an error boundary** falling back to the local `RoomEnvironment` — the preset is a `raw.githack.com` CDN fetch with no SLA, and a failure otherwise escapes the Canvas and replaces the whole landing page; **ring tube/color/roughness tuned** off the literal spec so a `metalness:1.0` ring reads against a mostly-dark night HDRI (chrome-on-night is otherwise black); **glass radius 0.6** (not 0.85) so the shell wraps the core instead of dominating the rings; **`CanvasTexture` built in `useMemo`** (not module scope) to avoid an SSR `document is not defined` hazard.
- Verified on a **real GPU** (headless Chrome + ANGLE/D3D11 on the AMD iGPU — not SwiftShader, which had made earlier FPS readings pessimistic): tier=high, stage=0, 0 console errors, no horizontal scroll at 1440/375/667. FPS full/bloom-only/no-post ≈ 56.5/56.8/56.9 — pinned at the ~57 Hz refresh cap, so the full post stack is not even GPU-bound. Mobile correctly gates to low / stage-2 / bloom-only / 120 particles.
- Self-evaluation: **8/8** of the Artifact's Section 12 criteria pass (chrome gradient on rings, glass refraction of the core, pointer parallax, fog depth, motion trails, physical-not-diagrammatic, clean build, FPS ≥45). First Load JS unchanged at **172 kB** — three.js and the whole post/transmission stack stay in the lazy `ssr:false` chunk.
- **The entire thinking cycle currently ships unwired**: the Core listens for `supportai:core:think` but no UI dispatches it (the Layer B hero-click trigger was deliberately removed). Idle breathing / rings / particles / parallax / reflections are live on the page; the contraction → pulse → emit ring → connections → cyan resolution choreography — and the motion trails, which are thinking-only — were verified by manually dispatching the event. Wiring a real trigger (e.g. the chat widget or a hero interaction) is the obvious next step.
- Rollback anchor: tag `pre-artifact-layerB` → `27565be`.

## 2026-10-04 — Layer B: Intelligence Core (single R3F scene)

- One lazy-mounted canvas behind the hero: diffuse breathing center, faint icosahedral structure, 4 irregular tilted rings, seeded particle field, thinking-only connection bands.
- Thinking is a 4s envelope (contract → pulse → ONE expanding ring → connections → cyan → idle), all damped interpolation, no snaps.
- three.js stays out of first load (172 vs 171 kB, +1 kB): everything behind a dynamic ssr:false boundary.
- Headless SwiftShader reports low tier, so connection bands were verified with a temporary forced-high tier (reverted); emit ring and contraction confirmed in screenshots.
- Temp hero-click trigger removed before commit. Scroll/tab/reduced-motion all pause; mounted-gate prevents hydration mismatch for reduced-motion users.

## 2026-10-04 — Layer A: AI Core foundation (no 3D)

- Obsidian token system in globals.css (`@theme inline`), shadcn primitives remapped; admin keeps literal zinc classes, chat inherits via tokens.
- Base-UI accordion has no usable height transition (Panel unmounts; keepMounted exists but needs external open state), so the FAQ is a controlled island with framer-motion height/opacity + rotating chevron.
- Measured contrast: body 17.4:1, muted 5.8:1. Mobile 375px: zero overflow by construction + headless measurement.
- shadcn here is Base-UI: Button has no `asChild` (links use `buttonVariants`), `onClick` on server-rendered anchors fails the build.

## 2026-10-03 — Layer 10: Polish (a11y, errors, SEO)

- Case-study "Try the live demo" dispatches `supportai:open` in place (client island; page stays a server component for metadata).
- Landing page back to server component with client button islands, enabling per-route metadata, robots.txt, sitemap.
- shadcn is Base-UI: `onClick` on a server-rendered anchor fails the build; placeholder links stay href-only.
- Widget hardening: scroll-stick respects scroll-up, form hides on next message, IME guard, dialog roles/labels, break-words bubbles.

## 2026-10-03 — Layer 9: Case study page

- Engineering write-up distilled from the build log: 6 decisions with numbers, 3 honest would-do-differently items.
- Widget mounted via `(marketing)/layout.tsx`, so the case study page demos itself. Screenshot TODO markers left for later.

## 2026-10-03 — Layer 8: Admin dashboard

- Cookie-gated `/admin` (HMAC-SHA256 token, timing-safe compare, 8h HttpOnly SameSite-Strict). Gate lives in `middleware.ts`, not the layout — layouts can't read the path, gating there would loop `/admin/login`.
- Stats, FAQ CRUD (re-embeds on Q/A change, so edits are immediately answerable), conversation logs with lazy thread expand.
- `resend.emails.send` resolves `{data, error}` instead of throwing — checked explicitly in both routes using it.
- `isAdminRequest` reads the raw Cookie header: route handlers get plain `Request`, not `NextRequest`.

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
