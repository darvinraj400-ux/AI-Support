"use client";

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('admin error boundary:', error);
    }
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-3">
      <h2 className="text-xl font-semibold text-white">Something went wrong.</h2>
      <p className="max-w-[60ch] text-sm leading-relaxed text-zinc-400">
        The admin panel hit an unexpected error. reloading usually fixes it —
        your data is safe.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Try again
      </button>
    </div>
  );
}
