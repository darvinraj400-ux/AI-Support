export default function AdminFaqsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading">
      <div className="flex justify-end">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-800" />
      </div>
      <div className="rounded-xl border border-zinc-800 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="mb-3 h-5 animate-pulse rounded bg-zinc-800 last:mb-0" />
        ))}
      </div>
    </div>
  );
}
