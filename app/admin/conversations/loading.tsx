export default function AdminConversationsLoading() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
