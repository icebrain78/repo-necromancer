/**
 * npm registry client for Repo Necromancer.
 *
 * Checks dependency maps for deprecated packages using the npm abbreviated
 * metadata endpoint. Responses are cached for 60 minutes via Next.js's
 * built-in Data Cache (REQ-8.2).
 */

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
