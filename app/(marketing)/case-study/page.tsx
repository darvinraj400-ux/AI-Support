import type { Metadata } from 'next';
import Image from 'next/image';
import { buttonVariants } from '@/components/ui/button';
import { DemoButton } from './demo-button';

export const metadata: Metadata = {
  title: 'Case Study — SupportAI',
  description:
    'How SupportAI was built: RAG over pgvector, tool-call handoff after two misses, Groq primary with Gemini fallback, all on free tiers.',
};

const DECISIONS = [
  {
    title: 'Tool-call handoff, not similarity threshold',
    body: 'I started with a threshold: zero matches below 0.5 means no answer. Then I measured. Junk queries scored 0.57 to 0.59, real matches 0.68 to 0.77. A 0.04 to 0.09 gap is not a threshold, it is a coin flip. So I stopped thresholding and gave the model a reportNoAnswer tool to call instead of guessing. The handoff signal is now deterministic: the model either called the tool or it did not.',
    code: 'junk 0.57-0.59 vs real 0.68-0.77 // too thin to threshold',
  },
  {
    title: 'Server-authoritative fallback copy',
    body: 'When the model has nothing to say, I do not let it write the apology. Model-generated fallbacks drift between turns and occasionally promise things. One fixed string is persisted and streamed identically on every no-answer turn. It costs nothing and reads the same every time.',
    code: 'FALLBACK_TEXT = "I don\'t have that in my FAQs..."',
  },
  {
    title: 'PostgREST silently nulls vector RPC args',
    body: 'The first version of the similarity search returned zero rows with no error. The cause: passing a JS number[] to a vector-typed RPC argument, which PostgREST silently drops instead of coercing. The fix is a text argument with an internal cast, and the client sends the pgvector text format.',
    code: 'query_embedding: JSON.stringify(embedding) // "[0.02,-0.01,...]"',
  },
  {
    title: 'RLS default-deny reads as empty, not forbidden',
    body: 'Supabase enables row-level security by default, and an unauthorized read returns an empty table with no error. The FAQ table looked seeded and empty at the same time. One public read policy on faqs fixed it. The other three tables stay service_role-only by design.',
    code: 'faqs_public_read // SELECT for anon; nothing else',
  },
  {
    title: 'Switched providers mid-build without touching the route',
    body: 'Gemini 2.0-flash was retired mid-project. Its replacement hit a 20-request-per-day free-tier ceiling I measured, not one I read about. Because the route talks to the AI SDK and not to Google, the fix was changing one model ID, then flipping primary to Groq gpt-oss-120b at 664ms per turn with no daily cap.',
    code: 'groq("openai/gpt-oss-120b") // 664ms, was 54s+ on Gemini',
  },
  {
    title: 'Disabled Gemini thinking mode',
    body: 'Before the provider switch, single turns took up to 45 seconds. The embedding plus FAQ context already contains everything needed for these answers, so token-by-token reasoning added nothing. Setting the thinking budget to zero brought turns under 2 seconds.',
    code: 'thinkingConfig: { thinkingBudget: 0 } // 45s -> 1.5s',
  },
];

const FLOW = [
  'Visitor',
  'Chat widget',
  '/api/chat',
  'embed query',
  'match_faqs (pgvector)',
  'build prompt',
  'Groq (fallback: Gemini)',
  'stream',
  'persist',
  'no-answer tool: count',
  '2nd failure: handoff',
];

export default function CaseStudyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-[1200px] px-6">
        {/* Hero */}
        <section className="py-20 md:py-28">
          <p className="text-sm font-medium tracking-wide text-indigo-400">Case Study</p>
          <h1 className="mt-3 max-w-[20ch] text-4xl font-semibold tracking-tight text-white md:text-6xl">
            SupportAI — a drop-in AI support widget that knows when to hand off
          </h1>
          <p className="mt-5 max-w-[70ch] text-base leading-relaxed text-zinc-400">
            SupportAI answers product questions from a real FAQ knowledge base over
            pgvector, streams the answer into a chat widget, and escalates to a human
            after two consecutive misses. The non-trivial part is not any one piece.
            It is retrieval, confidence, handoff, and admin tooling all working together.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Role</dt>
              <dd className="mt-1 text-zinc-200">Solo — design, engineering, documentation.</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Stack</dt>
              <dd className="mt-1 text-zinc-200">Next.js 15 · Supabase pgvector · Groq / Gemini · Vercel.</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Timeline</dt>
              <dd className="mt-1 text-zinc-200">Built over 2 days.</dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <DemoButton />
            <a
              href="https://github.com/darvinraj400-ux/AI-Support"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className:
                  'border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800 hover:text-white',
              })}
            >
              View source
            </a>
          </div>
          <figure className="mt-14">
            <Image
              src="/case-study/landing.png"
              alt="Nimbus Analytics landing page with the SupportAI chat widget in the bottom-right corner"
              width={1901}
              height={941}
              sizes="100vw"
              className="w-full rounded-xl border border-zinc-800 shadow-2xl"
            />
            <figcaption className="mt-3 text-center text-sm text-zinc-500">
              The demo surface. Nimbus is fictional — the widget is the real product.
            </figcaption>
          </figure>
        </section>

        {/* 1. Problem */}
        <section className="border-t border-zinc-800 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            The problem
          </h2>
          <div className="mt-6 flex max-w-[70ch] flex-col gap-4 text-base leading-relaxed text-zinc-400">
            <p>
              A small SaaS does not need a chatbot that guesses. It needs something
              narrower: answer the questions the docs already cover, word for word,
              and the moment a question falls outside the docs, get a human involved
              with context attached.
            </p>
            <p>
              That sounds simple until the pieces have to agree. Retrieval has to
              find the right rows. The model has to trust the retrieved context and
              nothing else. Something has to decide, per turn, whether the answer
              counts — and count consecutive failures without losing state across
              reloads. Then an admin needs to see what happened.
            </p>
            <p>
              SupportAI is that whole loop: a floating widget, a streaming RAG API,
              a two-strike handoff counter, and a small admin panel for FAQs and
              conversation logs.
            </p>
          </div>
        </section>

        {/* 2. Architecture */}
        <section className="border-t border-zinc-800 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            The architecture
          </h2>
          <p className="mt-6 max-w-[70ch] text-base leading-relaxed text-zinc-400">
            One request flows through eleven steps. Embeddings come from Gemini,
            generation defaults to Groq with a Gemini fallback, and every turn is
            persisted to Postgres before the stream closes.
          </p>
          <div
            aria-label="Request flow diagram"
            className="mt-8 flex flex-wrap items-center gap-2"
          >
            {FLOW.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-zinc-600">→</span>}
                <span
                  className={`rounded-lg border px-3 py-1.5 font-mono text-xs ${
                    step.startsWith('2nd failure')
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  {step}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <figure>
              <Image
                src="/case-study/widget.png"
                alt="SupportAI widget streaming a grounded answer from the FAQ knowledge base"
                width={398}
                height={341}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full rounded-xl border border-zinc-800 shadow-2xl"
              />
              <figcaption className="mt-3 text-sm text-zinc-500">
                A grounded answer, streamed from the FAQ knowledge base.
              </figcaption>
            </figure>
            <figure>
              <Image
                src="/case-study/handoff.png"
                alt="SupportAI offering human handoff after two consecutive questions outside the FAQ scope"
                width={428}
                height={689}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full rounded-xl border border-zinc-800 shadow-2xl"
              />
              <figcaption className="mt-3 text-sm text-zinc-500">
                Two misses in a row, and it hands off instead of guessing.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 3. Decisions */}
        <section className="border-t border-zinc-800 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Technical decisions
          </h2>
          <div className="mt-8 flex max-w-[70ch] flex-col gap-8">
            {DECISIONS.map((d) => (
              <div key={d.title}>
                <h3 className="font-semibold text-white">{d.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-zinc-400">{d.body}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 px-4 py-2.5 font-mono text-xs text-zinc-300">
                  {d.code}
                </pre>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Differently */}
        <section className="border-t border-zinc-800 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            What I would do differently
          </h2>
          <ul className="mt-6 flex max-w-[70ch] list-disc flex-col gap-3 pl-5 text-base leading-relaxed text-zinc-400">
            <li>
              Mid-stream provider fallback. Today only a synchronous failure fails
              over; a 404 halfway through a stream loses the turn. The stream
              needs a catch point that can restart on the fallback model.
            </li>
            <li>
              Real rate limiting on /api/handoff. It currently relies on the
              platform edge. Upstash Redis with a sliding window is the
              intended fix.
            </li>
            <li>
              Admin auth is a shared password, not a user system. Fine for a
              demo, wrong for multi-tenant.
            </li>
          </ul>
        </section>

        {/* 5. Under the hood */}
        <section className="border-t border-zinc-800 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Under the hood
          </h2>
          <div className="mt-8 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
            <figure>
              <Image
                src="/case-study/admin.png"
                alt="Admin dashboard showing conversation stats and recent activity"
                width={1918}
                height={941}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full rounded-xl border border-zinc-800 shadow-2xl"
              />
              <figcaption className="mt-3 text-sm text-zinc-500">
                FAQ CRUD, conversation logs, and handoff stats.
              </figcaption>
            </figure>
            <figure>
              <Image
                src="/case-study/mobile.png"
                alt="SupportAI widget rendered at 375px width"
                width={329}
                height={708}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="mx-auto w-full max-w-[280px] rounded-xl border border-zinc-800 shadow-2xl"
              />
              <figcaption className="mt-3 text-sm text-zinc-500">
                The widget at 375px. Nothing overflows.
              </figcaption>
            </figure>
          </div>
          <dl className="mt-8 grid max-w-3xl gap-4 text-sm sm:grid-cols-2">            {[
              ['Codebase', '~3,400 lines across ~70 files, 8 commits'],
              ['Verify', 'npm run seed · tsc --noEmit · npm run build, all green'],
              ['Fallback order', 'Groq gpt-oss-120b, then Gemini 3.1-flash-lite'],
              ['Cost', 'Zero paid tools: Gemini, Groq, Supabase, Vercel, Resend, GitHub free tiers'],
            ].map(([term, def]) => (
              <div key={term} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <dt className="text-zinc-500">{term}</dt>
                <dd className="mt-1 font-mono text-xs leading-relaxed text-zinc-300">{def}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-6 py-8 text-sm">
          <p className="text-zinc-300">
            Built by{' '}
            <a
              href="https://github.com/darvinraj400-ux"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 underline-offset-4 hover:underline"
            >
              Darvin Raj
            </a>
          </p>
          <p className="text-xs text-zinc-500">
            Nimbus Analytics is a fictional product created for this case study.
          </p>
        </div>
      </footer>
    </div>
  );
}
