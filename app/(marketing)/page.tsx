import { ChatWidget } from '@/components/chat/ChatWidget';

export default function MarketingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Nimbus Analytics</h1>
      <p className="text-sm text-muted-foreground">
        Landing page placeholder — the support widget is what we&apos;re testing.
      </p>
      <ChatWidget />
    </main>
  );
}
