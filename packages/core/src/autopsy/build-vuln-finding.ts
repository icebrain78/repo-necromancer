import type { AutopsyFinding } from '../types.js';

export interface OsvVulnSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  affectedPackages: number;
}

/**
 * Builds a vulnerability finding from an OSV summary, or returns `null`
 * when no vulnerabilities were found.
 *
 * Severity rules:
 * - `fatal`   when critical + high > 0
 * - `serious` when moderate > 0 (and critical + high = 0)
 * - `minor`   when only low-severity vulns are present
 */
export function buildVulnFinding(
  summary: OsvVulnSummary,
): AutopsyFinding | null {
  const { critical, high, moderate, low, affectedPackages } = summary;
  const total = critical + high + moderate + low;

  if (total === 0) {
    return null;
  }

  const severity =
    critical + high > 0 ? 'fatal' : moderate > 0 ? 'serious' : 'minor';

  // Build evidence string omitting zero counts
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} CRITICAL`);
  if (high > 0) parts.push(`${high} HIGH`);
  if (moderate > 0) parts.push(`${moderate} MODERATE`);
  if (low > 0) parts.push(`${low} LOW`);
  const evidence = `${parts.join(', ')} across ${affectedPackages} ${affectedPackages === 1 ? 'package' : 'packages'}`;

  return {
    id: 'known-vulns',
    category: 'vulnerabilities',
    severity,
    title: `${total} known ${total === 1 ? 'vulnerability' : 'vulnerabilities'} in dependencies`,
    evidence,
    fixHint:
      'Run `npm audit fix` or manually upgrade the affected packages to patched versions.',
  };
}
