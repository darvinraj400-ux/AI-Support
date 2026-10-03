export default function MarketingLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-6" aria-label="Loading">
      <div className="flex h-16 items-center justify-between">
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="hidden gap-8 md:flex">
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800" />
      </div>
      <div className="flex flex-col items-center py-20 md:py-28">
        <div className="h-10 w-3/4 animate-pulse rounded-lg bg-zinc-800 md:h-14" />
        <div className="mt-5 h-4 w-1/2 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-zinc-800" />
        <div className="mt-8 flex gap-3">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
