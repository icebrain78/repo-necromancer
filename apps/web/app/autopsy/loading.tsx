/**
 * Autopsy loading skeleton – shown by Next.js while the server component
 * fetches and processes repository autopsy data.
 *
 * Uses animated pulse placeholders matching the dark graveyard theme.
 */

export default function AutopsyLoading() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      {/* Header skeleton */}
      <header className="mb-8 space-y-3">
        <div className="h-9 w-72 bg-stone-800 rounded animate-pulse" aria-hidden="true" />
        <div className="h-5 w-48 bg-stone-800 rounded animate-pulse" aria-hidden="true" />
        <div className="h-16 w-full max-w-2xl bg-stone-800 rounded animate-pulse border-l-4 border-stone-700" aria-hidden="true" />
      </header>

      <main role="status" aria-label="Loading autopsy report…">
        {/* Fatal findings skeleton */}
        <section className="mb-6">
          <div className="h-7 w-32 bg-stone-800 rounded animate-pulse mb-3" aria-hidden="true" />
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2 animate-pulse"
                aria-hidden="true"
              >
                <div className="h-5 w-2/3 bg-stone-700 rounded" />
                <div className="h-4 w-full bg-stone-700 rounded font-mono" />
                <div className="h-4 w-3/4 bg-stone-700 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Serious findings skeleton */}
        <section className="mb-6">
          <div className="h-7 w-32 bg-stone-800 rounded animate-pulse mb-3" aria-hidden="true" />
          <div className="bg-stone-800 border border-stone-700 rounded p-4 space-y-2 animate-pulse" aria-hidden="true">
            <div className="h-5 w-1/2 bg-stone-700 rounded" />
            <div className="h-4 w-5/6 bg-stone-700 rounded font-mono" />
            <div className="h-4 w-2/3 bg-stone-700 rounded" />
          </div>
        </section>
      </main>

      {/* Footer buttons skeleton */}
      <footer className="mt-8 flex gap-4">
        <div className="h-10 w-48 bg-stone-800 rounded animate-pulse" aria-hidden="true" />
        <div className="h-10 w-40 bg-stone-800 rounded animate-pulse" aria-hidden="true" />
      </footer>
    </div>
  );
}
