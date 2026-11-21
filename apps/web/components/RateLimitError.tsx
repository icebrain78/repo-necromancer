/**
 * RateLimitError – shown in place of the grid when GitHub rate-limits us.
 *
 * Displays the spooky message from REQ-2.4 with the reset time.
 * The "Try again" button reloads the page via a plain form action (no JS needed).
 */

interface RateLimitErrorProps {
  resetAt: string | null;
}

export function RateLimitError({ resetAt }: RateLimitErrorProps) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
      <div className="max-w-lg text-center space-y-4">
        <p className="text-2xl" aria-hidden="true">
          ⚰️
        </p>
        <p className="text-red-400 font-serif text-lg">
          The spirits are restless — GitHub&apos;s rate limit has been reached.
          {resetAt ? ` Try again after ${resetAt}.` : ''}{' '}
          Add a <code className="text-stone-300">GITHUB_TOKEN</code> to increase
          your limit.
        </p>
        {/* Plain HTML form reload — works without client JS */}
        <form action="">
          <button
            type="submit"
            className="mt-4 px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-100 rounded"
          >
            Try again
          </button>
        </form>
      </div>
    </div>
  );
}
