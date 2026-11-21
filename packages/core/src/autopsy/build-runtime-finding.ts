import type { AutopsyFinding } from '../types.js';

/**
 * Produces runtime findings based on Node.js version and EOL information.
 *
 * - Both null: nothing to report → `[]`
 * - majorVersion is null (or zero): one "node-version-unknown" minor finding
 * - EOL date is in the past: one "node-eol" fatal finding
 * - EOL date is in the future: healthy runtime → `[]`
 */
export function buildRuntimeFinding(
  majorVersion: number | null,
  eolDate: string | null,
): AutopsyFinding[] {
  // Nothing to report when we have no version and no EOL date
  if (majorVersion === null && eolDate === null) {
    return [];
  }

  // Could not determine the Node.js version
  if (majorVersion === null || majorVersion === 0) {
    return [
      {
        id: 'node-version-unknown',
        category: 'runtime',
        severity: 'minor',
        title: 'Node.js version could not be determined',
        evidence:
          'No engines field, .nvmrc, or .node-version file was found in this repository.',
        fixHint:
          'Add an "engines" field to package.json (e.g. "node": ">=20") or add a .nvmrc file.',
      },
    ];
  }

  // We have a version — check whether it is EOL
  if (eolDate === null) {
    // Could not fetch EOL data; don't fabricate a finding
    return [];
  }

  const eol = new Date(eolDate);
  const now = new Date();

  if (eol <= now) {
    return [
      {
        id: 'node-eol',
        category: 'runtime',
        severity: 'fatal',
        title: `Node.js ${majorVersion} is end-of-life`,
        evidence: `Node.js ${majorVersion} reached end-of-life on ${eolDate}.`,
        fixHint: `Upgrade to an LTS release of Node.js (Node.js 20 or 22 as of 2025).`,
      },
    ];
  }

  // EOL is in the future — healthy runtime, nothing to flag
  return [];
}
