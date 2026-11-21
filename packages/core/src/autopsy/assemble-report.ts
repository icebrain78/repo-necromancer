import type { AutopsyFinding, AutopsyReport } from '../types.js';

/**
 * Assembles a complete `AutopsyReport` from pre-computed parts.
 *
 * Pure function — no I/O. The optional `now` parameter exists so tests can
 * inject a fixed timestamp and get deterministic `generatedAt` values.
 */
export function assembleReport(
  owner: string,
  name: string,
  findings: AutopsyFinding[],
  causeOfDeath: AutopsyFinding | null,
  narrative: string,
  truncatedDepCount: number,
  now: Date = new Date(),
): AutopsyReport {
  return {
    owner,
    name,
    generatedAt: now.toISOString(),
    findings,
    causeOfDeath,
    narrative,
    truncatedDepCount,
  };
}
