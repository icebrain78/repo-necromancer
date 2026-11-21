/**
 * OSV.dev vulnerability client for Repo Necromancer.
 *
 * Sends a single batch query to the OSV API and aggregates results into an
 * `OsvVulnSummary`. The POST request is wrapped in `unstable_cache` (key
 * derived from sorted package names) with a 3600-second TTL so the response
 * is cached consistently with the rest of the autopsy data (REQ-A7.1).
 */

import { unstable_cache } from 'next/cache';

import type { OsvVulnSummary } from '@repo-necromancer/core/autopsy/build-vuln-finding';
import { resolveMinVersion } from '@repo-necromancer/core/autopsy/resolve-min-version';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';

// ---------------------------------------------------------------------------
// Raw OSV API shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface OsvSeverity {
  type: string; // e.g. "CRITICAL", "HIGH", "MODERATE", "LOW"
  score?: string;
}

interface OsvVuln {
  id: string;
  severity?: OsvSeverity[];
}

interface OsvQueryResult {
  vulns?: OsvVuln[];
}

interface OsvBatchResponse {
  results: OsvQueryResult[];
}

// ---------------------------------------------------------------------------
// Core implementation — not cached (called by the cached wrapper below)
// ---------------------------------------------------------------------------

/**
 * Build and POST the OSV batch query, then aggregate the results.
 * Returns a zeroed summary on any HTTP error (REQ-A3.4, REQ-A8.7).
 */
async function _fetchVulnBatch(
  names: string[],
  versions: string[],
): Promise<OsvVulnSummary> {
  const zeroed: OsvVulnSummary = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    affectedPackages: 0,
  };

  if (names.length === 0) return zeroed;

  const queries = names.map((name, i) => ({
    package: { name, ecosystem: 'npm' },
    version: versions[i] ?? '0.0.0',
  }));

  let res: Response;
  try {
    res = await fetch(OSV_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    });
  } catch {
    // Network failure — return zeroed (REQ-A8.7)
    return zeroed;
  }

  if (!res.ok) {
    return zeroed;
  }

  let data: OsvBatchResponse;
  try {
    data = (await res.json()) as OsvBatchResponse;
  } catch {
    return zeroed;
  }

  const summary: OsvVulnSummary = { ...zeroed };

  for (const result of data.results) {
    const vulns = result.vulns ?? [];
    if (vulns.length === 0) continue;

    summary.affectedPackages++;

    for (const vuln of vulns) {
      const severities = vuln.severity ?? [];
      if (severities.length === 0) {
        // No severity listed — count as low
        summary.low++;
        continue;
      }
      for (const sev of severities) {
        switch (sev.type.toUpperCase()) {
          case 'CRITICAL':
            summary.critical++;
            break;
          case 'HIGH':
            summary.high++;
            break;
          case 'MODERATE':
          case 'MEDIUM':
            summary.moderate++;
            break;
          default:
            summary.low++;
        }
      }
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Cached public API
// ---------------------------------------------------------------------------

/**
 * Fetch vulnerability data for a set of dependencies from OSV.dev.
 *
 * Uses the `minVersion` resolved from each declared range as the query
 * version (REQ-A3.4). The response is cached for 3600 seconds, keyed by
 * sorted package names (REQ-A7.1). Returns a zeroed summary on any error.
 *
 * @param deps - `{ packageName: versionRange }` map (pre-capped to ≤ 60 entries).
 */
export async function fetchVulnBatch(
  deps: Record<string, string>,
): Promise<OsvVulnSummary> {
  const sortedNames = Object.keys(deps).sort();

  // Build the cached function keyed on the sorted package list.
  const cached = unstable_cache(
    async (names: string[], versions: string[]) => _fetchVulnBatch(names, versions),
    ['osv', ...sortedNames],
    { revalidate: 3600 },
  );

  const versions = sortedNames.map((name) => {
    const range = deps[name] ?? '*';
    return resolveMinVersion(range) ?? '0.0.0';
  });

  return cached(sortedNames, versions);
}
