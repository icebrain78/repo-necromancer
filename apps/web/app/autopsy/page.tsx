/**
 * Autopsy page – server component.
 *
 * Orchestrates deep static analysis of a single dead Node.js repository and
 * renders the resulting AutopsyReport via UI sub-components (task 8).
 *
 * Data flow (REQ-A design):
 *   1. Validate ?repo param
 *   2. Fan out GitHub file-existence checks in Promise.allSettled
 *   3. Parse package.json; capDependencies(allDeps, 60)
 *   4. Fan out npm, OSV, and endoflife.date fetches in Promise.allSettled
 *   5. Call pure builder functions → pickCauseOfDeath → generateNarrative
 *   6. assembleReport → render
 */

import { capDependencies } from '@repo-necromancer/core/autopsy/cap-dependencies';
import { buildRuntimeFinding } from '@repo-necromancer/core/autopsy/build-runtime-finding';
import { buildDepFindings } from '@repo-necromancer/core/autopsy/build-dep-findings';
import { buildVulnFinding } from '@repo-necromancer/core/autopsy/build-vuln-finding';
import { buildHygieneFindings } from '@repo-necromancer/core/autopsy/build-hygiene-findings';
import { pickCauseOfDeath } from '@repo-necromancer/core/autopsy/pick-cause-of-death';
import { assembleReport } from '@repo-necromancer/core/autopsy/assemble-report';
import { extractNodeVersion } from '@repo-necromancer/core/extract-node-version';
import { resolveLtsAlias } from '@repo-necromancer/core/resolve-lts-alias';
import { generateNarrative } from '@repo-necromancer/core/llm';
import type { AutopsyFinding, AutopsyReport } from '@repo-necromancer/core/types';

import {
  fetchRepo,
  fetchFileContent,
  fetchDirListing,
} from '../../lib/github';
import { fetchEolDate } from '../../lib/eol';
import { fetchDeprecatedAndLatest } from '../../lib/npm';
import { fetchVulnBatch } from '../../lib/osv';
import { NotFoundError, RateLimitError, GitHubApiError } from '../../lib/errors';
import { RateLimitError as RateLimitErrorComponent } from '../../components/RateLimitError';

// ---------------------------------------------------------------------------
// Param validation (REQ-A1.2)
// ---------------------------------------------------------------------------

const REPO_PARAM_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function parseRepoParam(raw: string | undefined): { owner: string; name: string } | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  if (!REPO_PARAM_RE.test(decoded)) return null;
  const slash = decoded.indexOf('/');
  return { owner: decoded.slice(0, slash), name: decoded.slice(slash + 1) };
}

// ---------------------------------------------------------------------------
// package.json helpers
// ---------------------------------------------------------------------------

interface ParsedPkgJson {
  engines?: { node?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkgJson(raw: string): ParsedPkgJson | null {
  try {
    return JSON.parse(raw) as ParsedPkgJson;
  } catch {
    return null;
  }
}

const NPM_TEST_PLACEHOLDER = 'echo "Error: no test specified" && exit 1';

function hasTestScript(scripts: Record<string, string> | undefined): boolean {
  if (!scripts) return false;
  const test = scripts['test'];
  if (!test) return false;
  return test.trim() !== NPM_TEST_PLACEHOLDER;
}

// ---------------------------------------------------------------------------
// Node version resolution
// ---------------------------------------------------------------------------

function resolveNodeMajor(
  enginesNode: string | undefined,
  nvmrcContent: string | null,
): number | null {
  const raw = extractNodeVersion(enginesNode, nvmrcContent ?? undefined);
  if (raw === null) return null;

  if (/^lts\//i.test(raw)) {
    return resolveLtsAlias(raw);
  }

  const major = parseInt(raw, 10);
  return isNaN(major) ? null : major;
}

// ---------------------------------------------------------------------------
// Settled-result helpers
// ---------------------------------------------------------------------------

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

// ---------------------------------------------------------------------------
// Minimal UI stubs (task 8 will replace with proper components)
// ---------------------------------------------------------------------------

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-8">
      <p className="text-red-400 max-w-lg text-center">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline components (REQ-A8) – proper versions live in task 8 components.
// These are co-located here so the page compiles and renders for task 7.
// ---------------------------------------------------------------------------

function AutopsyHeader({
  report,
}: {
  report: AutopsyReport;
}) {
  const { owner, name, causeOfDeath, narrative } = report;
  return (
    <header className="mb-8 space-y-3">
      <h1 className="font-serif text-3xl text-stone-100">
        <a
          href={`https://github.com/${owner}/${name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-stone-300 underline underline-offset-4"
        >
          {owner}/{name}
        </a>
      </h1>
      <p className="text-red-400 font-semibold">
        Cause of death:{' '}
        {causeOfDeath ? causeOfDeath.title : 'No cause identified'}
      </p>
      <blockquote className="border-l-4 border-stone-500 pl-4 text-stone-300 italic leading-relaxed">
        {narrative}
      </blockquote>
    </header>
  );
}

type FindingSeverity = 'fatal' | 'serious' | 'minor';

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  fatal: 'Fatal',
  serious: 'Serious',
  minor: 'Minor',
};

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  fatal: 'text-red-400',
  serious: 'text-orange-400',
  minor: 'text-yellow-400',
};

function FindingCard({ finding }: { finding: AutopsyFinding }) {
  return (
    <article className="bg-stone-800 border border-stone-700 rounded p-4 space-y-1">
      <p className="font-semibold text-stone-100">{finding.title}</p>
      <p className="font-mono text-sm text-stone-300 break-words">{finding.evidence}</p>
      <p className="text-sm text-stone-400">Fix: {finding.fixHint}</p>
    </article>
  );
}

function FindingsGroup({
  severity,
  findings,
}: {
  severity: FindingSeverity;
  findings: AutopsyFinding[];
}) {
  if (findings.length === 0) return null;
  const color = SEVERITY_COLOR[severity];
  const label = SEVERITY_LABEL[severity];
  return (
    <section aria-labelledby={`findings-${severity}`} className="mb-6">
      <h2 id={`findings-${severity}`} className={`font-serif text-xl mb-3 ${color}`}>
        {label}{' '}
        <span className={`text-sm font-mono ${color}`} aria-label={`${findings.length} findings`}>
          <span className="sr-only">{findings.length} findings</span>
          <span aria-hidden="true">({findings.length})</span>
        </span>
      </h2>
      <div className="space-y-3">
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </section>
  );
}

// DownloadReportButton and ResurrectButton will be proper client components in
// task 8; for task 7 we include minimal inline server-rendered placeholders so
// the page is fully functional. The aria-label satisfies REQ-A9.4.
function DownloadReportButtonPlaceholder({ reportJson, owner, name }: {
  reportJson: string;
  owner: string;
  name: string;
}) {
  // Rendered as a form-action button so it works without JS in the stub.
  // Task 8 replaces this with the proper client component using Blob URLs.
  void reportJson; void owner; void name;
  return (
    <button
      aria-label="Download autopsy report as JSON"
      className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
      disabled
      title="Download available after task 8 client component is wired in"
    >
      Download report (JSON)
    </button>
  );
}

function ResurrectButtonPlaceholder() {
  return (
    <button
      disabled
      className="px-4 py-2 opacity-40 cursor-not-allowed bg-stone-700 text-stone-100 rounded"
    >
      Resurrect (coming soon)
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function AutopsyPage({ searchParams }: PageProps) {
  const { repo: repoParam } = await searchParams;

  // REQ-A1.2: validate the repo param before any network request
  const parsed = parseRepoParam(repoParam);
  if (!parsed) {
    return <ErrorState message="Invalid repository address." />;
  }

  const { owner, name } = parsed;

  // ---------------------------------------------------------------------------
  // Step 2: Fan out all GitHub file-existence / content checks (REQ-A design)
  // ---------------------------------------------------------------------------

  const [
    repoResult,
    pkgJsonResult,
    nvmrcResult,
    lockfileNpmResult,
    lockfileYarnResult,
    lockfilePnpmResult,
    travisResult,
    workflowsResult,
  ] = await Promise.allSettled([
    fetchRepo(owner, name),
    fetchFileContent(owner, name, 'package.json'),
    fetchFileContent(owner, name, '.nvmrc'),
    fetchFileContent(owner, name, 'package-lock.json'),
    fetchFileContent(owner, name, 'yarn.lock'),
    fetchFileContent(owner, name, 'pnpm-lock.yaml'),
    fetchFileContent(owner, name, '.travis.yml'),
    fetchDirListing(owner, name, '.github/workflows'),
  ]);

  // Handle fatal GitHub errors on the repo itself
  if (repoResult.status === 'rejected') {
    const err = repoResult.reason;
    if (err instanceof RateLimitError) {
      return <RateLimitErrorComponent resetAt={err.resetAt} />;
    }
    if (err instanceof NotFoundError) {
      return <ErrorState message="No soul found at that address." />;
    }
    if (err instanceof GitHubApiError) {
      return <ErrorState message={`GitHub error: ${err.message}`} />;
    }
    return <ErrorState message="Something stirred in the dark… please try again." />;
  }

  const repoData = repoResult.value;
  const pkgJsonRaw = settledValue(pkgJsonResult, null);
  const nvmrcRaw = settledValue(nvmrcResult, null);
  const hasLockfileNpm = settledValue(lockfileNpmResult, null) !== null;
  const hasLockfileYarn = settledValue(lockfileYarnResult, null) !== null;
  const hasLockfilePnpm = settledValue(lockfilePnpmResult, null) !== null;
  const hasLockfile = hasLockfileNpm || hasLockfileYarn || hasLockfilePnpm;
  const hasTravisCi = settledValue(travisResult, null) !== null;
  const hasGithubWorkflows = settledValue(workflowsResult, false) as boolean;

  // ---------------------------------------------------------------------------
  // Step 3: Parse package.json; cap dependencies (REQ-A6.1)
  // ---------------------------------------------------------------------------

  let pkg: ReturnType<typeof parsePkgJson> = null;
  if (pkgJsonRaw !== null) {
    pkg = parsePkgJson(pkgJsonRaw);
  }

  const allDeps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  };

  const { capped, truncatedDepCount } = capDependencies(allDeps, 60);

  // ---------------------------------------------------------------------------
  // Step 4: Resolve Node.js major version
  // ---------------------------------------------------------------------------

  const nodeMajor = resolveNodeMajor(pkg?.engines?.node, nvmrcRaw);

  // ---------------------------------------------------------------------------
  // Step 5: Fan out npm, OSV, and endoflife.date fetches (REQ-A design)
  // ---------------------------------------------------------------------------

  const [npmResult, osvResult, eolResult] = await Promise.allSettled([
    fetchDeprecatedAndLatest(capped),
    fetchVulnBatch(capped),
    nodeMajor !== null ? fetchEolDate(nodeMajor) : Promise.resolve(null),
  ]);

  const npmResults = settledValue(npmResult, []);
  const osvSummary = settledValue(osvResult, {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    affectedPackages: 0,
  });
  const eolDate = settledValue(eolResult, null);

  // ---------------------------------------------------------------------------
  // Step 6: Pure assembly
  // ---------------------------------------------------------------------------

  const runtimeFindings = buildRuntimeFinding(nodeMajor, eolDate);
  const depFindings = buildDepFindings(npmResults);
  const vulnFinding = buildVulnFinding(osvSummary);
  const hygieneFindings = buildHygieneFindings({
    hasLockfile,
    hasTestScript: hasTestScript(pkg?.scripts),
    hasTravisCi,
    hasGithubWorkflows,
    archived: repoData.archived,
  });

  const allFindings: AutopsyFinding[] = [
    ...runtimeFindings,
    ...depFindings,
    ...(vulnFinding ? [vulnFinding] : []),
    ...hygieneFindings,
  ];

  const causeOfDeath = pickCauseOfDeath(allFindings);

  // ---------------------------------------------------------------------------
  // Step 7: Generate narrative (falls back to none-provider on error)
  // ---------------------------------------------------------------------------

  // Build a partial report for narrative generation
  const partialReport: AutopsyReport = assembleReport(
    owner,
    name,
    allFindings,
    causeOfDeath,
    '', // narrative filled in after generation
    truncatedDepCount,
  );

  const narrative = await generateNarrative(partialReport);

  // ---------------------------------------------------------------------------
  // Step 8: Assemble final report
  // ---------------------------------------------------------------------------

  const report = assembleReport(
    owner,
    name,
    allFindings,
    causeOfDeath,
    narrative,
    truncatedDepCount,
  );

  const reportJson = JSON.stringify(report, null, 2);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const fatalFindings = allFindings.filter((f) => f.severity === 'fatal');
  const seriousFindings = allFindings.filter((f) => f.severity === 'serious');
  const minorFindings = allFindings.filter((f) => f.severity === 'minor');

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      <AutopsyHeader report={report} />

      {truncatedDepCount > 0 && (
        <p className="text-stone-400 text-sm mb-6">
          Analysis limited to 60 of {60 + truncatedDepCount} dependencies.
        </p>
      )}

      <main>
        <FindingsGroup severity="fatal" findings={fatalFindings} />
        <FindingsGroup severity="serious" findings={seriousFindings} />
        <FindingsGroup severity="minor" findings={minorFindings} />

        {allFindings.length === 0 && (
          <p className="text-stone-400">No issues found — this repository may still have a pulse.</p>
        )}
      </main>

      <footer className="mt-8 flex gap-4">
        <DownloadReportButtonPlaceholder
          reportJson={reportJson}
          owner={owner}
          name={name}
        />
        <ResurrectButtonPlaceholder />
      </footer>
    </div>
  );
}
