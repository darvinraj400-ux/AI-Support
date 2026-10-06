"use client";

import { useEffect } from 'react';

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('marketing error boundary:', error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-2xl font-medium text-foreground">
        Something went wrong.
      </h2>
      <p className="max-w-[50ch] text-sm leading-relaxed text-foreground-muted">
        Try again — and if it keeps happening, ask the support widget below.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-[linear-gradient(135deg,var(--accent-idle),var(--accent-active))] px-4 py-2 text-sm font-medium text-white hover:bg-[linear-gradient(135deg,#7c4dff,var(--accent-active))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Try again
      </button>
    </div>
  );
}
