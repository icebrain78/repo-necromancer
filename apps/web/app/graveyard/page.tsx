/**
 * Graveyard page – server component.
 *
 * Orchestrates all data fetching for a GitHub username or single repo URL,
 * classifies every repo, sorts the results, and renders a grid of tombstone
 * cards via the UI components added in task 11.
 *
 * Data flow:
 *   1. Parse ?q → username | { owner, repo }
 *   2. Fetch repo list from GitHub
 *   3. Collect + deduplicate deps across all repos
 *   4. fetchDeprecatedCount (concurrency ≤ 8 handled by npm.ts)
 *   5. Per-repo parallel analysis (Node detection, package.json, .nvmrc, EOL)
 *   6. classifyRepo + sortTombstones
 *   7. Render grid
 */

import { classifyRepo } from '@repo-necromancer/core/classify-repo';
import { extractNodeVersion } from '@repo-necromancer/core/extract-node-version';
import { isNodeRepo } from '@repo-necromancer/core/detect-node';
import { resolveLtsAlias } from '@repo-necromancer/core/resolve-lts-alias';
import { sortTombstones } from '@repo-necromancer/core/sort-tombstones';
import type { TombstoneData } from '@repo-necromancer/core/types';

import { fetchFileContent, fetchRepo, fetchUserRepos } from '../../lib/github';
import { fetchEolStatus } from '../../lib/eol';
import { fetchDeprecatedCount } from '../../lib/npm';
import { NotFoundError, RateLimitError } from '../../lib/errors';
import { GraveyardGrid } from '../../components/GraveyardGrid';
import { RateLimitError as RateLimitErrorComponent } from '../../components/RateLimitError';

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** Parsed representation of the ?q parameter. */
type ParsedQuery =
  | { kind: 'username'; username: string }
  | { kind: 'repo'; owner: string; repo: string }
  | { kind: 'invalid' };

const USERNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_URL_RE = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?\/?$/;

function parseQuery(q: string): ParsedQuery {
  const trimmed = q.trim();

  const repoMatch = REPO_URL_RE.exec(trimmed);
  if (repoMatch) {
    const owner = repoMatch[1];
    const repo = repoMatch[2];
    if (owner && repo) {
      return { kind: 'repo', owner, repo };
    }
  }

  if (USERNAME_RE.test(trimmed)) {
    return { kind: 'username', username: trimmed };
  }

  return { kind: 'invalid' };
}

// ---------------------------------------------------------------------------
// Per-repo analysis
// ---------------------------------------------------------------------------

interface PerRepoDepMap {
  repoFullName: string;
  deps: Record<string, string>;
}

/** Merge + deduplicate dependency maps from multiple repos. */
function mergeDeps(maps: PerRepoDepMap[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const { deps } of maps) {
    for (const [name, version] of Object.entries(deps)) {
      merged[name] = version;
    }
  }
  return merged;
}

interface ParsedPackageJson {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkgJson(raw: string): ParsedPackageJson | null {
  try {
    return JSON.parse(raw) as ParsedPackageJson;
  } catch {
    return null;
  }
}

/** Collect deps from a parsed package.json. */
function collectDeps(pkg: ParsedPackageJson): Record<string, string> {
  return {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
}

interface RepoAnalysis {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  language: string | null;
  pushedAt: string;
  archived: boolean;
  nodeVersion: string | null;
  nodeVersionEol: boolean | null;
  deps: Record<string, string> | null; // null = package.json absent/unparseable
}

/** Analyse a single repo: detect Node, fetch package.json + .nvmrc, check EOL. */
async function analyseRepo(
  owner: string,
  repoName: string,
  language: string | null,
  pushedAt: string,
  archived: boolean,
  url: string,
): Promise<RepoAnalysis> {
  const base: RepoAnalysis = {
    owner,
    name: repoName,
    fullName: `${owner}/${repoName}`,
    url,
    language,
    pushedAt,
    archived,
    nodeVersion: null,
    nodeVersionEol: null,
    deps: null,
  };

  // REQ-3.3: only check package.json when language alone is inconclusive
  const languageIsNode = language === 'JavaScript' || language === 'TypeScript';
  let pkgJsonContent: string | null = null;

  if (!languageIsNode) {
    // Need to check for package.json to decide if it's a Node repo at all
    pkgJsonContent = await fetchFileContent(owner, repoName, 'package.json');
    if (!isNodeRepo(language, pkgJsonContent !== null)) {
      return base; // UnknownSpecies — no further analysis
    }
  } else {
    // Already know it's Node; still need package.json for dep/engine analysis
    pkgJsonContent = await fetchFileContent(owner, repoName, 'package.json');
  }

  // At this point we know it's a Node repo
  let enginesNode: string | undefined;
  let deps: Record<string, string> | null = null;

  if (pkgJsonContent !== null) {
    const pkg = parsePkgJson(pkgJsonContent);
    if (pkg !== null) {
      enginesNode = pkg.engines?.node;
      deps = collectDeps(pkg);
    }
  }

  // Fetch .nvmrc (optional; ignore errors)
  let nvmrcContent: string | undefined;
  const nvmrcRaw = await fetchFileContent(owner, repoName, '.nvmrc');
  if (nvmrcRaw !== null) {
    nvmrcContent = nvmrcRaw;
  }

  // Extract Node version
  const rawVersion = extractNodeVersion(enginesNode, nvmrcContent);

  let nodeVersion: string | null = null;
  let nodeVersionEol: boolean | null = null;

  if (rawVersion !== null) {
    // Resolve LTS alias if present (e.g. "lts/hydrogen" → "18")
    if (/^lts\//i.test(rawVersion)) {
      const resolved = resolveLtsAlias(rawVersion);
      if (resolved !== null) {
        nodeVersion = String(resolved);
        nodeVersionEol = await fetchEolStatus(resolved);
      }
      // else: unrecognised alias → nodeVersion and nodeVersionEol stay null
    } else {
      const major = parseInt(rawVersion, 10);
      if (!isNaN(major)) {
        nodeVersion = rawVersion;
        nodeVersionEol = await fetchEolStatus(major);
      }
    }
  }

  return { ...base, nodeVersion, nodeVersionEol, deps };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function GraveyardPage({ searchParams }: PageProps) {
  const { q } = await searchParams;

  if (!q || q.trim() === '') {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
        <p className="text-stone-400">Enter a GitHub username or repo URL to begin.</p>
      </div>
    );
  }

  const parsed = parseQuery(q.trim());

  if (parsed.kind === 'invalid') {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
        <p className="text-red-500">
          Invalid input. Enter a GitHub username or a full GitHub repo URL.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 1. Fetch repo list
  // -------------------------------------------------------------------------

  let rawRepos: Array<{
    owner: string;
    name: string;
    language: string | null;
    pushedAt: string;
    archived: boolean;
    url: string;
  }> = [];
  let remainder = 0;

  try {
    if (parsed.kind === 'username') {
      const result = await fetchUserRepos(parsed.username);
      rawRepos = result.repos.map((r) => ({
        owner: r.owner.login,
        name: r.name,
        language: r.language,
        pushedAt: r.pushed_at,
        archived: r.archived,
        url: r.html_url,
      }));
      remainder = result.remainder;
    } else {
      const r = await fetchRepo(parsed.owner, parsed.repo);
      rawRepos = [
        {
          owner: r.owner.login,
          name: r.name,
          language: r.language,
          pushedAt: r.pushed_at,
          archived: r.archived,
          url: r.html_url,
        },
      ];
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      return <RateLimitErrorComponent resetAt={err.resetAt} />;
    }
    if (err instanceof NotFoundError) {
      return (
        <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
          <p className="text-stone-400">No soul found at that address.</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
        <p className="text-stone-400">Something stirred in the dark… please try again.</p>
      </div>
    );
  }

  if (rawRepos.length === 0) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
        <p className="text-stone-400">No repositories found.</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 2–4. Per-repo analysis + dep deduplication + deprecated count
  // -------------------------------------------------------------------------

  const analyses = await Promise.allSettled(
    rawRepos.map((r) =>
      analyseRepo(r.owner, r.name, r.language, r.pushedAt, r.archived, r.url),
    ),
  );

  const resolved: RepoAnalysis[] = [];
  for (const result of analyses) {
    if (result.status === 'fulfilled') {
      resolved.push(result.value);
    }
    // Rejected analyses are silently dropped (network errors on individual repos)
  }

  // Deduplicate deps across all repos with known package.json
  const depMaps: PerRepoDepMap[] = resolved
    .filter((a) => a.deps !== null)
    .map((a) => ({ repoFullName: a.fullName, deps: a.deps! }));

  const mergedDeps = mergeDeps(depMaps);
  const deprecatedCount = await fetchDeprecatedCount(
    Object.keys(mergedDeps).length > 0 ? mergedDeps : null,
  );

  // Build per-repo deprecated count. Because we deduplicated, the global
  // deprecatedCount is used as the count for each Node repo that has deps.
  // The design aggregates across all repos (REQ-4.2) rather than per-repo.
  // We assign null to repos whose package.json was unreadable, and the global
  // count to those for which deps were collected.

  // -------------------------------------------------------------------------
  // 5–6. Classify + sort
  // -------------------------------------------------------------------------

  const tombstones: TombstoneData[] = resolved.map((analysis): TombstoneData => {
    const hasPackageJson = analysis.deps !== null;
    const nodeDetected = isNodeRepo(analysis.language, hasPackageJson);

    // Per-repo deprecated count: use the global batch result for repos with
    // readable deps; null for repos whose package.json was absent/unparseable.
    const repoDeprecatedCount = !nodeDetected
      ? null
      : analysis.deps !== null
        ? (deprecatedCount ?? null)
        : null;

    const status = classifyRepo({
      pushedAt: analysis.pushedAt,
      archived: analysis.archived,
      isNodeRepo: nodeDetected,
      deprecatedDepCount: repoDeprecatedCount,
      nodeVersionEol: nodeDetected ? analysis.nodeVersionEol : null,
    });

    return {
      owner: analysis.owner,
      name: analysis.name,
      url: analysis.url,
      language: analysis.language,
      pushedAt: analysis.pushedAt,
      archived: analysis.archived,
      deprecatedDepCount: repoDeprecatedCount,
      nodeVersion: analysis.nodeVersion,
      nodeVersionEol: analysis.nodeVersionEol,
      status,
    };
  });

  const sorted = sortTombstones(tombstones);

  // -------------------------------------------------------------------------
  // 7. Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-stone-100">The Graveyard</h1>
        <p className="text-stone-400 mt-1">
          {sorted.length} {sorted.length === 1 ? 'soul' : 'souls'} unearthed
        </p>
      </header>

      <GraveyardGrid tombstones={sorted} remainder={remainder} />
    </div>
  );
}
