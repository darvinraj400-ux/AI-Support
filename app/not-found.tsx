import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
      <p className="text-7xl font-semibold tracking-tight text-white">404</p>
      <p className="max-w-[50ch] text-base leading-relaxed text-zinc-400">
        This page wandered off. The docs, at least, are still where you left them.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Back home
      </Link>
      <p className="mt-6 text-xs text-zinc-500">
        Nimbus Analytics is a fictional product built as a portfolio piece.
      </p>
    </div>
  );
}
