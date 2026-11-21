/**
 * FindingCard – server component.
 *
 * Renders a single autopsy finding: title, evidence (monospace), and fix hint.
 *
 * REQ-A8.3
 */

import type { AutopsyFinding } from '@repo-necromancer/core/types';

interface FindingCardProps {
  finding: AutopsyFinding;
}

export function FindingCard({ finding }: FindingCardProps) {
  return (
    <article className="bg-stone-800 border border-stone-700 rounded p-4 space-y-1">
      <p className="font-semibold text-stone-100">{finding.title}</p>
      <p className="font-mono text-sm text-stone-300 break-words">{finding.evidence}</p>
      <p className="text-sm text-stone-400">Fix: {finding.fixHint}</p>
    </article>
  );
}
