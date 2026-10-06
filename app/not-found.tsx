import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-7xl font-medium text-foreground">404</p>
      <p className="max-w-[50ch] text-base leading-relaxed text-foreground-muted">
        This page wandered off. The docs, at least, are still where you left them.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-[linear-gradient(135deg,var(--accent-idle),var(--accent-active))] px-4 py-2 text-sm font-medium text-white hover:bg-[linear-gradient(135deg,#7c4dff,var(--accent-active))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Back home
      </Link>
      <p className="mt-6 text-xs text-foreground-subtle">
        Nimbus Analytics is a fictional product built as a portfolio piece.
      </p>
    </div>
  );
}
