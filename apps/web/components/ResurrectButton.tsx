'use client';

/**
 * ResurrectButton – client component.
 *
 * Disabled placeholder shown on the autopsy page. The Resurrect feature is
 * implemented in a later spec.
 *
 * REQ-A8.5
 */

export function ResurrectButton() {
  return (
    <button
      disabled
      className="px-4 py-2 opacity-40 cursor-not-allowed bg-stone-700 text-stone-100 rounded"
    >
      Resurrect (coming soon)
    </button>
  );
}
