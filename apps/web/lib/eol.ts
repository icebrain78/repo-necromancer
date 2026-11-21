/**
 * endoflife.date client for Repo Necromancer.
 *
 * Checks whether a Node.js major version has reached end-of-life.
 * Responses are cached for 60 minutes via Next.js's built-in Data Cache
 * (REQ-8.2).
 */

const EOL_API = 'https://endoflife.date/api';

/** Shape returned by the endoflife.date Node.js release endpoint. */
interface EolEntry {
  eol: string; // ISO date string, e.g. "2025-04-30"
}

/**
 * Fetch the EOL date string for a Node.js major version.
 *
 * Returns the raw ISO date string from the endoflife.date API (e.g.
 * "2023-09-11"), or `null` when the version is unknown or the API fails.
 * Used by the autopsy page to pass the actual date to `buildRuntimeFinding`.
 */
export async function fetchEolDate(majorVersion: number): Promise<string | null> {
  const url = `${EOL_API}/nodejs/${majorVersion}.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: 3600 },
    });
  } catch {
    return null;
  }

  if (!res.ok) {
    return null;
  }

  let data: EolEntry;
  try {
    data = (await res.json()) as EolEntry;
  } catch {
    return null;
  }

  if (!data.eol || typeof data.eol !== 'string') {
    return null;
  }

  return data.eol;
}

/**
 * Check whether a Node.js major version has reached end-of-life.
 *
 * Calls `GET https://endoflife.date/api/nodejs/{major}.json` and compares
 * the `eol` date against the current UTC date (REQ-5.3).
 *
 * @param majorVersion - Integer major version, e.g. `18`.
 * @returns `true` when the version is EOL, `false` when it is still
 *          supported, or `null` when the version is unknown or the API
 *          returns a non-200 response (REQ-5.4).
 */
export async function fetchEolStatus(majorVersion: number): Promise<boolean | null> {
  const url = `${EOL_API}/nodejs/${majorVersion}.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: 3600 },
    });
  } catch {
    // Network failure — treat as unknown (REQ-5.4)
    return null;
  }

  if (!res.ok) {
    // Non-200 (including 404 for an unrecognised version) — treat as unknown
    return null;
  }

  let data: EolEntry;
  try {
    data = (await res.json()) as EolEntry;
  } catch {
    return null;
  }

  if (!data.eol || typeof data.eol !== 'string') {
    return null;
  }

  const eolDate = new Date(data.eol);
  if (isNaN(eolDate.getTime())) {
    return null;
  }

  return eolDate < new Date();
}
