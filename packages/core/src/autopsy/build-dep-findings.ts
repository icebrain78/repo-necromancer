import type { AutopsyFinding } from '../types.js';

export interface DepResult {
  /** Package name. */
  name: string;
  /** Declared version range from package.json. */
  declared: string;
  /** Deprecation message from npm, or null if not deprecated. */
  deprecated: string | null;
  /** Latest published version tag from npm, or null on failure. */
  latest: string | null;
  /** Minimum version resolved from the declared range, or null. */
  minVersion: string | null;
}

/**
 * Builds up to two findings from npm dependency metadata:
 *
 * 1. `deprecated-deps` (fatal) — when one or more packages carry a deprecation message.
 * 2. `outdated-majors` (serious) — when one or more packages have a newer major on npm.
 *
 * Both findings may be returned together from a single pass over `results`.
 * Returns an empty array when neither condition is met.
 */
export function buildDepFindings(results: DepResult[]): AutopsyFinding[] {
  const deprecated: Array<{ name: string; message: string }> = [];
  const outdated: Array<{ name: string; declared: string; latest: string }> = [];

  for (const r of results) {
    // Deprecated check
    if (r.deprecated !== null && r.deprecated.trim() !== '') {
      deprecated.push({ name: r.name, message: r.deprecated });
    }

    // Outdated-majors check
    if (r.latest !== null && r.minVersion !== null) {
      const latestMajor = parseMajor(r.latest);
      const minMajor = parseMajor(r.minVersion);
      if (latestMajor !== null && minMajor !== null && latestMajor > minMajor) {
        outdated.push({ name: r.name, declared: r.declared, latest: r.latest });
      }
    }
  }

  const findings: AutopsyFinding[] = [];

  if (deprecated.length > 0) {
    const rawEvidence = deprecated
      .map((d) => `${d.name}: ${d.message}`)
      .join(', ');
    const evidence =
      rawEvidence.length > 200 ? rawEvidence.slice(0, 197) + '...' : rawEvidence;

    findings.push({
      id: 'deprecated-deps',
      category: 'deprecated-deps',
      severity: 'fatal',
      title: `${deprecated.length} deprecated ${deprecated.length === 1 ? 'dependency' : 'dependencies'} found`,
      evidence,
      fixHint:
        'Replace each deprecated package with its recommended successor or a maintained alternative.',
    });
  }

  if (outdated.length > 0) {
    const pairs = outdated.slice(0, 10);
    const evidence = pairs
      .map((o) => `${o.name}: ${o.declared} → ${o.latest}`)
      .join(', ');

    findings.push({
      id: 'outdated-majors',
      category: 'outdated-majors',
      severity: 'serious',
      title: `${outdated.length} ${outdated.length === 1 ? 'dependency is' : 'dependencies are'} behind by one or more major versions`,
      evidence,
      fixHint:
        'Review each package\'s migration guide and update to the latest major version.',
    });
  }

  return findings;
}

/** Returns the numeric major from a "major.minor.patch" string, or null. */
function parseMajor(version: string): number | null {
  const match = version.match(/^(\d+)/);
  if (!match) return null;
  const val = parseInt(match[1] ?? '0', 10);
  return isNaN(val) ? null : val;
}
