/**
 * Graveyard loading skeleton – shown by Next.js while the server component
 * fetches and processes repository data.
 *
 * Renders six placeholder tombstone cards arranged in the same grid as the
 * real page, using animated pulse to indicate activity.
 */

export default function GraveyardLoading() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      <header className="mb-8">
        <div className="h-9 w-48 bg-stone-800 rounded animate-pulse" />
        <div className="h-4 w-32 bg-stone-800 rounded animate-pulse mt-2" />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 bg-stone-900 p-6 rounded-lg">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="bg-stone-800 border border-stone-700 rounded-lg p-5 flex flex-col gap-3 animate-pulse"
            role="status"
            aria-label="Loading tombstone"
          >
            {/* Repo name */}
            <div className="h-5 w-3/4 bg-stone-700 rounded" />
            {/* Language */}
            <div className="h-4 w-1/3 bg-stone-700 rounded" />
            {/* Date */}
            <div className="h-4 w-1/2 bg-stone-700 rounded font-mono" />
            {/* Dep count */}
            <div className="h-4 w-2/5 bg-stone-700 rounded" />
            {/* Runtime */}
            <div className="h-4 w-1/3 bg-stone-700 rounded font-mono" />
            {/* Badge */}
            <div className="h-5 w-16 bg-stone-700 rounded mt-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
