/**
 * FindingsGroup – server component.
 *
 * Renders one severity section (Fatal / Serious / Minor) with a count badge.
 * Skips rendering entirely when the findings array is empty.
 *
 * REQ-A8.3, REQ-A9.4
 */

import type { AutopsyFinding, FindingSeverity } from '@repo-necromancer/core/types';
import { FindingCard } from './FindingCard';

interface FindingsGroupProps {
  severity: FindingSeverity;
  findings: AutopsyFinding[];
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  fatal: 'Fatal',
  serious: 'Serious',
  minor: 'Minor',
};

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  fatal: 'text-red-400',
  serious: 'text-orange-400',
  minor: 'text-yellow-400',
};

export function FindingsGroup({ severity, findings }: FindingsGroupProps) {
  if (findings.length === 0) return null;

  const color = SEVERITY_COLOR[severity];
  const label = SEVERITY_LABEL[severity];
  const headingId = `findings-${severity}`;

  return (
    <section aria-labelledby={headingId} className="mb-6">
      <h2 id={headingId} className={`font-serif text-xl mb-3 ${color}`}>
        {label}{' '}
        <span className={`text-sm font-mono ${color}`}>
          <span className="sr-only">{findings.length} findings</span>
          <span aria-hidden="true">({findings.length})</span>
        </span>
      </h2>

      <div className="space-y-3">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </section>
  );
}
