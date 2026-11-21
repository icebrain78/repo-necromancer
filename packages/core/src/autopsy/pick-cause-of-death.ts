import type { AutopsyFinding } from '../types.js';

/**
 * Category priority order for picking the cause of death.
 *
 * "known-vulns" appears at two positions because its priority depends on
 * severity: a fatal (CRITICAL/HIGH) vuln ranks higher than deprecated-deps,
 * while a serious/minor one ranks lower. We handle this by using two synthetic
 * slots and mapping the actual finding at comparison time.
 */
const PRIORITY_SLOTS: ReadonlyArray<string> = [
  'archived-repo',         // 0 – highest
  'node-eol',              // 1
  'known-vulns-critical',  // 2 – placeholder: known-vulns with fatal severity
  'deprecated-deps',       // 3
  'known-vulns-moderate',  // 4 – placeholder: known-vulns with serious/minor severity
  'outdated-majors',       // 5
  'missing-lockfile',      // 6
  'dead-ci',               // 7
  'missing-test-script',   // 8
  'node-version-unknown',  // 9 – lowest
];

const SEVERITY_RANK: Record<string, number> = {
  fatal: 0,
  serious: 1,
  minor: 2,
};

/**
 * Returns the effective priority slot index for a finding.
 * Lower index = higher priority.
 */
function slotOf(finding: AutopsyFinding): number {
  if (finding.id === 'known-vulns') {
    // Fatal severity → maps to the high-priority "known-vulns-critical" slot.
    // Serious or minor → maps to the lower "known-vulns-moderate" slot.
    const slot =
      finding.severity === 'fatal' ? 'known-vulns-critical' : 'known-vulns-moderate';
    const idx = PRIORITY_SLOTS.indexOf(slot);
    return idx === -1 ? PRIORITY_SLOTS.length : idx;
  }
  const idx = PRIORITY_SLOTS.indexOf(finding.id);
  // Unknown IDs are ranked lower than any known slot.
  return idx === -1 ? PRIORITY_SLOTS.length : idx;
}

/**
 * Selects the single most critical finding from the array using deterministic
 * priority rules (REQ-A4.1):
 *
 * 1. Category priority (see PRIORITY_SLOTS above).
 * 2. Among equal priority, prefer higher severity (`fatal` > `serious` > `minor`).
 * 3. Among equal priority and severity, prefer the finding whose `id` comes
 *    first alphabetically.
 *
 * Returns `null` only when `findings` is empty.
 * Never mutates the input array.
 */
export function pickCauseOfDeath(
  findings: AutopsyFinding[],
): AutopsyFinding | null {
  if (findings.length === 0) return null;

  return findings.reduce((best, current) => {
    const slotBest = slotOf(best);
    const slotCurrent = slotOf(current);

    if (slotCurrent !== slotBest) {
      return slotCurrent < slotBest ? current : best;
    }

    // Same slot — compare severity rank
    const sevBest = SEVERITY_RANK[best.severity] ?? 3;
    const sevCurrent = SEVERITY_RANK[current.severity] ?? 3;

    if (sevCurrent !== sevBest) {
      return sevCurrent < sevBest ? current : best;
    }

    // Same severity — alphabetical tie-break on id
    return current.id < best.id ? current : best;
  });
}
