'use client';

/**
 * GraveyardInput – client component for the main search input.
 *
 * Validates the input against the two accepted patterns (REQ-1.2):
 *   • GitHub username:  ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$
 *   • GitHub repo URL:  https://github.com/<owner>/<repo>[.git][/]
 *
 * On valid submit, navigates to /graveyard?q=<encoded-value>.
 * Shows an inline error without navigating for invalid or empty input.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const USERNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_URL_RE =
  /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?\/?$/;

function validate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Please enter a GitHub username or repo URL.';
  }
  if (USERNAME_RE.test(trimmed) || REPO_URL_RE.test(trimmed)) {
    return null;
  }
  return 'Enter a GitHub username (e.g. torvalds) or a full GitHub repo URL (e.g. https://github.com/owner/repo).';
}

export function GraveyardInput() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationError = validate(value);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    setError(null);
    router.push(`/graveyard?q=${encodeURIComponent(value.trim())}`);
  }

  const inputId = 'graveyard-input';
  const errorId = 'graveyard-input-error';

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-xl space-y-3">
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          GitHub username or repo URL
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="torvalds  or  https://github.com/owner/repo"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error !== null}
          className="flex-1 bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-500 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
        />
        <button
          type="submit"
          className="px-5 py-2 bg-stone-700 hover:bg-stone-600 active:bg-stone-500 text-stone-100 rounded whitespace-nowrap font-serif"
        >
          Summon the Dead
        </button>
      </div>

      {error !== null && (
        <p id={errorId} role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
