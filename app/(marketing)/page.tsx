import type { Metadata } from 'next';
import { Bot, Layers, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Pulse } from '@/components/ui/Pulse';
import { AskAiButton, AskAiLink } from './ask-ai-button';
import { FaqAccordion } from './faq-accordion';
import { SiteNav } from './nav';

export const metadata: Metadata = {
  title: 'Nimbus Analytics — product analytics with AI support',
  description:
    'Real-time product analytics with an AI assistant that answers from the docs and hands off to a human when unsure.',
};

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
    question: 'How do I cancel my subscription?',
    answer:
      'Settings → Billing → Cancel Plan. Access until end of billing period. No fees, no calls.',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: '$19/mo',
    features: ['1 project', '10k events/mo', '2 seats'],
    popular: false,
  },
  {
    name: 'Growth',
    price: '$49/mo',
    features: ['5 projects', '100k events/mo', '10 seats'],
    popular: true,
  },
  {
    name: 'Scale',
    price: '$149/mo',
    features: ['Unlimited projects', '1M events/mo', 'Unlimited seats'],
    popular: false,
  },
];

const FEATURES = [
  {
    icon: Zap,
    title: 'Events in, insights out',
    body: 'Track anything with one line of code. Nimbus turns raw events into dashboards in seconds.',
  },
  {
    icon: Layers,
    title: 'Integrations that just work',
    body: 'Slack, Notion, Sheets, Zapier, plus REST and GraphQL APIs. Data where your team already lives.',
  },
  {
    icon: Bot,
    title: 'AI that knows your FAQs',
    body: "The support assistant in the corner answers from our own docs. If it doesn't know, it hands off to a human.",
  },
];

function DashboardMockup() {
  const bars = [38, 62, 45, 78, 55, 88, 66, 92, 50, 70, 84, 60];
  return (
    <div
      aria-hidden
      className="mx-auto mt-14 w-full max-w-3xl rounded-lg border border-border bg-surface p-5 text-left"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-3 font-mono text-xs text-foreground-subtle">nimbus overview</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {['Events', 'Active users', 'Revenue'].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-background-elevated p-3">
            <p className="text-xs text-foreground-subtle">{label}</p>
            <div className="mt-2 h-2 w-3/4 rounded bg-accent-idle/70" />
            <div className="mt-1.5 h-2 w-1/2 rounded bg-border" />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border bg-background-elevated p-4">
        <div className="flex h-32 items-end gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              style={{ height: `${h}%` }}
              className="flex-1 rounded-sm bg-accent-idle/70"
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-foreground-subtle">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <main className="mx-auto max-w-[1200px] px-6">
        {/* 2. Hero */}
        <section className="py-20 text-center md:py-28">
          <h1 className="text-4xl font-medium text-foreground md:text-6xl">
            Analytics that answers back.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-foreground-muted">
            Real-time product analytics for teams who&rsquo;d rather ship than dig
            through dashboards. Meet Nimbus — and the AI assistant that knows our
            docs better than we do.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#pricing"
              className={buttonVariants({ size: 'lg' })}
            >
              Start free trial
            </a>
            <AskAiButton />
          </div>
          <p className="mt-5 text-xs text-foreground-subtle">
            14-day free trial · No credit card · Cancel anytime
          </p>
          <DashboardMockup />
        </section>

        <Pulse variant="divider" />

        {/* 3. Logo strip */}
        <section className="py-12 text-center">
          <p className="text-xs text-foreground-subtle">
            Built with Next.js, Supabase pgvector, and the Vercel AI SDK.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-lg font-semibold text-foreground-subtle">
            {['Acme', 'Northwind', 'Globex', 'Initech', 'Umbrella'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </section>

        {/* 4. Features */}
        <section id="features" className="scroll-mt-20 py-20 md:py-28">
          <h2 className="text-center text-2xl font-medium text-foreground md:text-3xl">
            Everything you need, nothing you babysit
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-surface p-6 transition-colors duration-200 hover:border-border-strong">
                <f.icon className="h-6 w-6 text-accent-idle" />
                <h3 className="eyebrow mt-4">{f.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-foreground-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <Pulse variant="divider" />

        {/* 5. Pricing */}
        <section id="pricing" className="scroll-mt-20 py-20 md:py-28">
          <h2 className="text-center text-2xl font-medium text-foreground md:text-3xl">
            Simple pricing that scales with you
          </h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-lg border p-6 transition-colors duration-200 hover:border-border-strong ${
                  plan.popular
                    ? 'border-accent-idle bg-surface'
                    : 'border-border bg-surface'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-idle px-3 py-0.5 text-xs font-medium text-white">
                    Most popular
                  </span>
                )}
                <h3 className="eyebrow">{plan.name}</h3>
                <p className="mt-1 text-2xl font-medium text-foreground">{plan.price}</p>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-foreground-muted">
                  {plan.features.map((feat) => (
                    <li key={feat}>· {feat}</li>
                  ))}
                </ul>
                <a
                  href="#pricing"
                  className={buttonVariants({
                    variant: plan.popular ? 'default' : 'outline',
                    className: 'mt-6',
                  })}
                >
                  Start trial
                </a>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-foreground-muted">
            14-day free trial. No credit card.
          </p>
          <p className="mt-2 text-center text-sm text-foreground-subtle">
            Need more? Extra seats are $5/mo.{' '}
            <AskAiLink /> for details.
          </p>
        </section>

        <Pulse variant="divider" />

        {/* 6. FAQ */}
        <section id="faq" className="scroll-mt-20 py-20 md:py-28">
          <h2 className="text-center text-2xl font-medium text-foreground md:text-3xl">
            Frequently asked questions
          </h2>
          <FaqAccordion faqs={FAQS} />
        </section>
      </main>

      {/* 7. Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-6 py-12 text-sm sm:grid-cols-3">
          <div>
            <p className="eyebrow">Product</p>
            <ul className="mt-3 flex flex-col gap-2 text-foreground-muted">
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
              <li><a href="#" className="hover:text-foreground">Docs</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Company</p>
            <ul className="mt-3 flex flex-col gap-2 text-foreground-muted">
              <li><a href="#" className="hover:text-foreground">About</a></li>
              <li><a href="#" className="hover:text-foreground">Blog</a></li>
              <li><a href="#" className="hover:text-foreground">Careers</a></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Legal</p>
            <ul className="mt-3 flex flex-col gap-2 text-foreground-muted">
              <li><a href="#" className="hover:text-foreground">Privacy</a></li>
              <li><a href="#" className="hover:text-foreground">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-[1200px] px-6 py-5 text-xs text-foreground-subtle">
            © 2026 Nimbus Analytics. A fictional product built as a portfolio piece by Darvin Raj.
          </p>
        </div>
      </footer>
    </div>
  );
}
