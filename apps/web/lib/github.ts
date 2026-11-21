/**
 * GitHub REST API v3 client for Repo Necromancer.
 *
 * All fetch calls use Next.js's built-in Data Cache via `{ next: { revalidate: 3600 } }`
 * so responses are cached for 60 minutes (REQ-8.2).
 *
 * When GITHUB_TOKEN is set it is attached as a Bearer token on every request (REQ-2.3).
 */

import { GitHubApiError, NotFoundError, RateLimitError } from './errors';

const GITHUB_API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Raw GitHub API shapes (only the fields we consume)
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  language: string | null;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  default_branch: string;
}

interface GitHubContentsResponse {
  type: string;
  encoding: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the Authorization header when GITHUB_TOKEN is available. */
function authHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'];
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Parse the `X-RateLimit-Reset` header (Unix timestamp) into a human-readable
 * UTC string. Returns null when the header is absent or unparseable.
 */
function parseResetHeader(headers: Headers): string | null {
  const raw = headers.get('X-RateLimit-Reset');
  if (!raw) return null;
  const ms = parseInt(raw, 10) * 1000;
  if (isNaN(ms)) return null;
  return new Date(ms).toUTCString();
}

/**
 * Shared response handler. Throws the appropriate error class for non-OK
 * responses; returns the Response for callers to consume on success.
 */
function assertOk(res: Response): void {
  if (res.ok) return;

  if (res.status === 403 || res.status === 429) {
    throw new RateLimitError(parseResetHeader(res.headers));
  }
  if (res.status === 404) {
    throw new NotFoundError('No soul found at that address.');
  }
  throw new GitHubApiError(res.status, res.statusText);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchUserReposResult {
  /** Up to 20 non-fork repos, sorted by pushed date descending. */
  repos: GitHubRepo[];
  /**
   * Total non-fork repos seen across all pages fetched minus 20.
   * Zero when no overflow; this is the "+N more graves not dug" value.
   */
  remainder: number;
}

/**
 * Fetch up to 20 non-fork repos for a GitHub username.
 *
 * Pages through `GET /users/{username}/repos?per_page=100&sort=pushed` following
 * Link headers until 20 non-fork repos are collected or all pages are exhausted
 * (REQ-2.1).
 */
export async function fetchUserRepos(username: string): Promise<FetchUserReposResult> {
  const collected: GitHubRepo[] = [];
  let totalNonFork = 0;
  let url: string | null =
    `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`;

  while (url !== null) {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...authHeaders(),
      },
    });

    assertOk(res);

    const page = (await res.json()) as GitHubRepo[];
    for (const repo of page) {
      if (repo.fork) continue;
      totalNonFork++;
      if (collected.length < 20) {
        collected.push(repo);
      }
    }

    // Follow Link: <url>; rel="next" header if present
    url = parseNextLink(res.headers.get('Link'));
  }

  return {
    repos: collected,
    remainder: Math.max(0, totalNonFork - 20),
  };
}

/**
 * Fetch a single repo by owner and name.
 *
 * `GET /repos/{owner}/{repo}` (REQ-2.2).
 */
export async function fetchRepo(owner: string, repo: string): Promise<GitHubRepo> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...authHeaders(),
    },
  });

  assertOk(res);
  return res.json() as Promise<GitHubRepo>;
}

/**
 * Fetch the decoded text content of a file in a repo.
 *
 * `GET /repos/{owner}/{repo}/contents/{path}` (REQ-4.1, REQ-5.1).
 * Returns `null` when the file is absent (404).
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...authHeaders(),
    },
  });

  if (res.status === 404) return null;
  assertOk(res);

  const data = (await res.json()) as GitHubContentsResponse;

  if (data.encoding !== 'base64') {
    // Unexpected encoding — treat as unreadable
    return null;
  }

  // The GitHub API wraps base64 content with newlines; strip them before decoding.
  const cleaned = data.content.replace(/\n/g, '');
  return Buffer.from(cleaned, 'base64').toString('utf-8');
}

/**
 * Check whether a directory path exists in a repository and contains entries.
 *
 * `GET /repos/{owner}/{repo}/contents/{path}` — returns `true` when the
 * response is 200 and the body is an array (directory with at least one
 * entry), `false` on 404 or when the response body is not an array (REQ-A3.5).
 */
export async function fetchDirListing(
  owner: string,
  repo: string,
  path: string,
): Promise<boolean> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...authHeaders(),
    },
  });

  if (res.status === 404) return false;
  if (!res.ok) return false;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return false;
  }

  return Array.isArray(body) && body.length > 0;
}

// ---------------------------------------------------------------------------
// Link header parser
// ---------------------------------------------------------------------------

/**
 * Extract the `rel="next"` URL from a GitHub `Link` response header.
 * Returns `null` when no next page is present.
 *
 * Format: `<https://...>; rel="next", <https://...>; rel="last"`
 */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="next"/.exec(part.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}
