import type { Metadata } from 'next';
import Image from 'next/image';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Case Study — SupportAI',
  description:
    'How SupportAI was built: RAG over pgvector, tool-call handoff after two misses, Groq primary with Gemini fallback, all on free tiers.',
};

const RAG_FLOW = [
  'Visitor',
  'widget',
  '/api/chat',
  'embed query',
  'match_faqs (pgvector)',
  'build prompt',
  'Groq (fallback: Gemini)',
  'stream',
  'persist',
  'tool call if no answer',
  '2nd failure: handoff',
];

const CORE_FLOW = [
  'message sent',
  'think event',
  'contraction',
  'answer streams',
  'resolve event',
  'emit',
  'cyan resolution',
];

const DECISIONS = [
  {
    title: 'Tool-call handoff, not a similarity threshold',
    body: 'I started with a threshold: anything below a cutoff means no answer. Then I measured. Junk queries scored 0.57 to 0.59, real matches 0.68 to 0.77. A gap of 0.04 to 0.09 is not a threshold, it is a coin flip. So I stopped thresholding and gave the model a reportNoAnswer tool to call instead of guessing. The handoff signal is now deterministic: the model either called the tool or it did not.',
    code: 'junk 0.57-0.59 vs real 0.68-0.77 // too thin to threshold',
  },
  {
    title: 'The Core is wired to real product events',
    body: 'The Core never runs a decorative loop. Sending a message dispatches a think event and the artifact contracts while the request is still in flight. The first streamed token dispatches resolve and the signal ring opens 200ms later. A failed request dispatches resolve with error: true and the ring tints red instead of cyan. First-time visitors get one autofire think at 3.5s, gated by sessionStorage so it fires once and never again.',
    code: "think at send → resolve at first token → ring at +200ms",
  },
  {
    title: 'The fallback is the product, not the failure mode',
    body: 'Some devices have no WebGL, and forcing live 3D there produces stutter or a black screen. Those devices get a pre-rendered loop with the same framing and motion: 900 by 900, 8 seconds, 504KB. My first loop used a video element, which iOS Safari refuses to autoplay. I switched to animated WebP, which iOS treats as an image. The 3D scene is progressive enhancement. The fallback is the baseline.',
    code: '<img src="/core-fallback-loop.webp"> // plays where <video> would not',
  },
  {
    title: '4-tier quality ladder',
    body: 'I replaced a 3-tier model with ultra, high, medium, and low, resolved from GPU tier plus viewport width. Particle counts run 400, 300, 200, and 120 with 20, 15, 10, and 0 motion trails. DPR caps run 1.75, 1.5, and 1.25. Phones with strong GPUs moved from low to high, and weak desktop iGPUs get a boosted medium at 250 particles. Below 25fps for 2 seconds the tier drops one rung and never climbs back.',
    code: 'ultra 400/20 · high 300/15 · medium 200/10 · low 120/0',
  },
  {
    title: 'PostgREST silently nulls vector RPC args',
    body: 'The first version of the similarity search returned zero rows with no error. The cause: passing a JS number array to a vector-typed RPC argument, which PostgREST silently drops instead of coercing. The fix is a text argument with an internal cast, and the client sends the pgvector text format.',
    code: 'query_embedding: JSON.stringify(embedding) // "[0.02,-0.01,...]"',
  },
  {
    title: 'RLS default-deny reads as empty, not forbidden',
    body: 'Supabase enables row-level security by default, and an unauthorized read returns an empty table with no error. The FAQ table looked seeded and empty at the same time. One public read policy on faqs fixed it. The other three tables stay service_role-only by design.',
    code: 'faqs_public_read // SELECT for anon; nothing else',
  },
];

function FlowDiagram({ steps, label }: { steps: string[]; label: string }) {
  return (
    <div aria-label={label} className="mt-8 flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <span key={step} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-foreground-subtle">→</span>}
          <span
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs ${
              step.startsWith('2nd failure') || step.startsWith('cyan')
                ? 'border-accent-idle bg-accent-idle/10 text-accent-idle'
                : 'border-border bg-surface text-foreground'
            }`}
          >
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function CaseStudyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[1200px] px-6">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <p className="eyebrow">Case Study</p>
          <h1 className="mt-3 max-w-[20ch] text-4xl font-medium text-foreground md:text-6xl">
            SupportAI — an AI support widget with an intelligence core
          </h1>
          <p className="mt-5 max-w-[70ch] text-base leading-relaxed text-foreground-muted">
            SupportAI answers product questions from a real FAQ knowledge base
            and hands off to a human when it does not know. The non-trivial
            part is the Core: a live 3D artifact that contracts when you send
            a message and emits when the answer arrives.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <dt className="eyebrow">Role</dt>
              <dd className="mt-1 text-foreground">
                Solo: design, engineering, documentation.
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Stack</dt>
              <dd className="mt-1 text-foreground">
                Next.js 15 · Supabase pgvector · Groq / Gemini · React Three
                Fiber · Vercel.
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Timeline</dt>
              <dd className="mt-1 text-foreground">Oct 2 to Oct 10, 2026.</dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://support-ai-three-gold.vercel.app"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'lg' })}
            >
              Try the live demo
            </a>
            <a
              href="https://github.com/darvinraj400-ux/AI-Support"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className:
                  'border-border bg-transparent text-foreground hover:bg-surface-hover hover:text-foreground',
              })}
            >
              View source
            </a>
          </div>
          <figure className="mt-14">
            <Image
              src="/case-study/hero-core.png"
              alt="Nimbus Analytics landing hero with the Intelligence Core at idle"
              width={2160}
              height={1350}
              sizes="100vw"
              className="w-full rounded-lg border border-border shadow-none"
            />
            <figcaption className="mt-3 text-center text-sm text-foreground-subtle">
              The Core is not decoration, it is the product heartbeat. It
              contracts when you send a message and emits when the answer
              arrives.
            </figcaption>
          </figure>
        </section>

        {/* 1. Problem */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            The problem
          </h2>
          <div className="mt-6 flex max-w-[70ch] flex-col gap-4 text-base leading-relaxed text-foreground-muted">
            <p>
              A small SaaS does not need a chatbot that guesses. It needs
              something narrower: answer the questions the docs already cover,
              and the moment a question falls outside the docs, get a human
              involved with context attached.
            </p>
            <p>
              Two hard problems hide inside that sentence. First, answers must
              come from real docs, not invention, which means retrieval has to
              find the right rows and the model has to trust the retrieved
              context and nothing else. Second, escalation has to be clean:
              something must decide per turn whether the answer counts, count
              consecutive failures without losing state, and hand off with the
              conversation attached.
            </p>
            <p>
              The third problem is less obvious. Most AI products are
              invisible black boxes: you type, you get a reply, and the AI
              itself is never felt. I built the Core to fix that. It makes the
              intelligence visible by reacting to everything the system does.
            </p>
          </div>
        </section>

        {/* 2. How it works */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            How it works
          </h2>
          <h3 className="mt-8 font-semibold text-foreground">
            The RAG pipeline
          </h3>
          <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-foreground-muted">
            One request flows through eleven steps. Embeddings come from
            Gemini, generation defaults to Groq with a Gemini fallback, and
            every turn is persisted to Postgres before the stream closes.
          </p>
          <FlowDiagram steps={RAG_FLOW} label="Request flow diagram" />
          <h3 className="mt-12 font-semibold text-foreground">The Core</h3>
          <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-foreground-muted">
            The widget and the Core stay in sync through two DOM events. The
            artifact contracts on send and resolves into an emit on the first
            token, so what you see is always what the system just did.
          </p>
          <FlowDiagram steps={CORE_FLOW} label="Core response diagram" />
          <pre className="mt-6 max-w-[70ch] overflow-x-auto rounded-lg bg-surface px-4 py-2.5 font-mono text-xs text-foreground">
            {`// Chat widget → Core synchronization\ndispatchEvent(new CustomEvent('supportai:core:think'))   // on send\ndispatchEvent(new CustomEvent('supportai:core:resolve')) // on first token`}
          </pre>
        </section>

        {/* 3. Decisions */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            Technical decisions
          </h2>
          <div className="mt-8 flex max-w-[70ch] flex-col gap-8">
            {DECISIONS.map((d) => (
              <div key={d.title}>
                <h3 className="font-semibold text-foreground">{d.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-foreground-muted">
                  {d.body}
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-surface px-4 py-2.5 font-mono text-xs text-foreground">
                  {d.code}
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* 4. The Core, specifically */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            The Core, specifically
          </h2>
          <div className="mt-6 flex max-w-[70ch] flex-col gap-4 text-base leading-relaxed text-foreground-muted">
            <p>
              The Core exists because most AI products are invisible. You type
              a message, you get a reply, but the AI itself is a black box
              behind the curtain. The Core makes the intelligence visible: it
              reacts. It contracts when you send. It emits a signal when the
              answer arrives. It tints red when the chat fails. This is not
              animation for its own sake. It is a UI layer that reflects the
              system state.
            </p>
            <p>
              I built it in React Three Fiber as a layered composition: a
              diffuse center, an inner neural icosahedron, three irregular
              orbital rings, a sparse particle field, and connection bands
              that only appear while thinking. Lighting comes from drei
              Environment presets, the middle layer is real transmission
              glass, and the ultra tier runs a full post stack of bloom,
              chromatic aberration, vignette, and noise, scaled down per tier.
            </p>
            <p>
              Not every device can run WebGL, and forcing it produces 15fps
              stutter or a black screen. The right answer is a pre-rendered
              video loop for devices that cannot do live 3D. iOS Safari
              blocked autoplay on the video element, so I switched to animated
              WebP, which iOS treats as an image. The Core is now universal.
            </p>
          </div>
          <figure className="mt-10">
            <Image
              src="/case-study/chat-answer.png"
              alt="An answer streaming in the widget while the Core emits its signal ring"
              width={2160}
              height={1350}
              sizes="100vw"
              className="w-full rounded-lg border border-border shadow-none"
            />
            <figcaption className="mt-3 text-center text-sm text-foreground-subtle">
              An answer streaming in. The Core opened its signal ring 200ms
              after the first token arrived.
            </figcaption>
          </figure>
          <figure className="mx-auto mt-10 max-w-[320px]">
            <Image
              src="/case-study/mobile-hero.png"
              alt="The Core on a phone, pre-rendered"
              width={780}
              height={1688}
              sizes="320px"
              className="w-full rounded-lg border border-border shadow-none"
            />
            <figcaption className="mt-3 text-center text-sm text-foreground-subtle">
              Same Core, pre-rendered on mobile. Motion, not a still.
            </figcaption>
          </figure>
        </section>

        {/* 5. Differently */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            What I would do differently
          </h2>
          <ul className="mt-6 flex max-w-[70ch] list-disc flex-col gap-3 pl-5 text-base leading-relaxed text-foreground-muted">
            <li>
              Retry does not re-trigger the Core. The chat Retry button starts
              a new request without dispatching think, so the artifact stays
              still while the retry streams. Small, known, not fixed.
            </li>
            <li>
              Autofire timing on cold load runs about 2 seconds late. Shader
              compile blocks the main thread, so the 3.5s target lands near
              5.5s on slow hardware. Acceptable but visible.
            </li>
            <li>
              The idle-reduction state is subtle. After 45 seconds with no
              interaction, particle drift slows 40 percent. Most visitors will
              never notice. I would make the transition visible in v2.
            </li>
          </ul>
        </section>

        {/* 6. Under the hood */}
        <section className="border-t border-border py-16">
          <h2 className="text-2xl font-medium text-foreground md:text-3xl">
            Under the hood
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <figure>
              <Image
                src="/case-study/admin.png"
                alt="Admin dashboard with conversation stats and recent activity"
                width={2160}
                height={1350}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full rounded-lg border border-border shadow-none"
              />
              <figcaption className="mt-3 text-sm text-foreground-subtle">
                FAQ CRUD, conversation logs, and handoff stats.
              </figcaption>
            </figure>
            <figure>
              <Image
                src="/case-study/chat-error.png"
                alt="A failed request with the error message and the Core tinted red"
                width={2160}
                height={1350}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full rounded-lg border border-border shadow-none"
              />
              <figcaption className="mt-3 text-sm text-foreground-subtle">
                The failure path: an error message in the widget, a red tint
                on the Core.
              </figcaption>
            </figure>
          </div>
          <dl className="mt-8 grid max-w-3xl gap-4 text-sm sm:grid-cols-2">
            {[
              ['First Load JS', '173 kB for / (measured from build)'],
              ['Commits', '30 since the initial scaffold'],
              [
                'Codebase',
                '~6,400 lines across 70 files (app, components, lib)',
              ],
              [
                'Stack',
                'Next.js 15 App Router · Tailwind v4 · shadcn (Base-UI) · Vercel AI SDK · Supabase pgvector · React Three Fiber · postprocessing · Groq primary / Gemini fallback',
              ],
              [
                'Cost',
                'Zero paid tools: Gemini, Groq, Supabase, Vercel, Resend, GitHub free tiers',
              ],
            ].map(([term, def]) => (
              <div
                key={term}
                className="rounded-xl border border-border bg-surface/50 p-4"
              >
                <dt className="eyebrow">{term}</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-foreground">
                  {def}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-6 py-8 text-sm">
          <p className="text-foreground">
            Built by{' '}
            <a
              href="https://github.com/darvinraj400-ux"
              target="_blank"
              rel="noreferrer"
              className="text-accent-idle underline-offset-4 hover:underline"
            >
              Darvin Raj
            </a>
          </p>
          <p className="text-xs text-foreground-subtle">
            Nimbus Analytics is a fictional product. This case study is a
            portfolio piece.
          </p>
        </div>
      </footer>
    </div>
  );
}
