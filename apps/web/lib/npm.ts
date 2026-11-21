/**
 * npm registry client for Repo Necromancer.
 *
 * Checks dependency maps for deprecated packages using the npm abbreviated
 * metadata endpoint. Responses are cached for 60 minutes via Next.js's
 * built-in Data Cache (REQ-8.2).
 */

import type { DepResult } from '@repo-necromancer/core/autopsy/build-dep-findings';
import { resolveMinVersion } from '@repo-necromancer/core/autopsy/resolve-min-version';

export type { DepResult };

const NPM_REGISTRY = 'https://registry.npmjs.org';

/**
 * Abbreviated metadata shape returned by the npm install metadata endpoint.
 * We only read the `deprecated` field on the latest version.
 */
interface NpmAbbreviatedMeta {
  'dist-tags': { latest?: string };
  versions: Record<string, { deprecated?: string }>;
}

/**
 * Fetch abbreviated metadata for a single package name.
 * Returns whether the latest published version is deprecated.
 * Throws on non-OK HTTP responses (caller uses Promise.allSettled).
 */
async function isPackageDeprecated(name: string): Promise<boolean> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      Accept: 'application/vnd.npm.install-v1+json',
    },
  });

  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${name}`);
  }

  const data = (await res.json()) as NpmAbbreviatedMeta;
  const latest = data['dist-tags']?.latest;
  if (!latest) return false;

  const latestMeta = data.versions[latest];
  if (!latestMeta) return false;

  return typeof latestMeta.deprecated === 'string' && latestMeta.deprecated.length > 0;
}

/**
 * Run at most `concurrency` async tasks simultaneously.
 *
 * Accepts an array of zero-argument async factories and executes them with the
 * given concurrency cap. Returns results in the same order as the input array,
 * mirroring the shape of `Promise.allSettled`.
 */
async function allSettledWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      const task = tasks[index];
      if (!task) continue;
      try {
        results[index] = { status: 'fulfilled', value: await task() };
      } catch (err) {
        results[index] = {
          status: 'rejected',
          reason: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Count how many packages in `deps` have a deprecated latest version on npm.
 *
 * Fans out up to 8 simultaneous registry requests. Single-package failures
 * are silently skipped (they do not increment the count). Returns `null` when
 * `deps` is `null` or `undefined`; returns `0` for an empty map.
 *
 * @param deps - Merged, deduplicated `{ packageName: versionRange }` map from
 *               all repos being analysed (REQ-4.2).
 */
export async function fetchDeprecatedCount(
  deps: Record<string, string> | null | undefined,
): Promise<number | null> {
  if (deps == null) return null;

  const names = Object.keys(deps);
  if (names.length === 0) return 0;

  const tasks = names.map((name) => () => isPackageDeprecated(name));
  const results = await allSettledWithConcurrency(tasks, 8);

  let count = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      count++;
    }
    // Rejected results are treated as non-deprecated (REQ-4.4: failure → null at caller level,
    // but here individual failures just don't increment the count so the batch still returns a number)
  }

  return count;
}

// ---------------------------------------------------------------------------
// Autopsy: fetch deprecated message + latest version for each dependency
// ---------------------------------------------------------------------------

/**
 * Fetch the deprecated message and latest version tag for a single package.
 * Returns the raw `NpmAbbreviatedMeta` for the caller to extract fields from.
 * Throws on non-OK HTTP responses (caller uses allSettledWithConcurrency).
 */
async function fetchPackageMeta(name: string): Promise<NpmAbbreviatedMeta> {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      Accept: 'application/vnd.npm.install-v1+json',
    },
  });

  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${name}`);
  }

  return (await res.json()) as NpmAbbreviatedMeta;
}

/**
 * Fetch deprecated status and latest version for all packages in `deps`.
 *
 * Fans out up to 8 simultaneous registry requests (REQ-A3.2, REQ-A3.3).
 * Failed individual fetches produce a `DepResult` with `null` fields for
 * that package so the analysis can proceed with partial data (REQ-A8.7).
 *
 * @param deps - `{ packageName: versionRange }` map (pre-capped to ≤ 60 entries).
 */
export async function fetchDeprecatedAndLatest(
  deps: Record<string, string>,
): Promise<DepResult[]> {
  const entries = Object.entries(deps);

  if (entries.length === 0) return [];

  const tasks = entries.map(([name, declared]) => async (): Promise<DepResult> => {
    const meta = await fetchPackageMeta(name);
    const latestTag = meta['dist-tags']?.latest ?? null;
    const latestMeta = latestTag !== null ? (meta.versions[latestTag] ?? null) : null;
    const deprecated =
      latestMeta !== null &&
      typeof latestMeta.deprecated === 'string' &&
      latestMeta.deprecated.length > 0
        ? latestMeta.deprecated
        : null;

    return {
      name,
      declared,
      deprecated,
      latest: latestTag,
      minVersion: resolveMinVersion(declared),
    };
  });

  const settled = await allSettledWithConcurrency(tasks, 8);

  return settled.map((result, i) => {
    const entry = entries[i];
    const name = entry?.[0] ?? '';
    const declared = entry?.[1] ?? '';
    if (result.status === 'fulfilled') {
      return result.value;
    }
    // On failure, return a DepResult with null fields (REQ-A8.7)
    return {
      name,
      declared,
      deprecated: null,
      latest: null,
      minVersion: resolveMinVersion(declared),
    };
  });
}
