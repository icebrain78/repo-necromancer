/**
 * Integration test for the autopsy pipeline using the `dead-node-repo`
 * fixture. All network calls are replaced with realistic mock data so the
 * test stays fast and deterministic.
 *
 * The fixture represents a repository with:
 *   - Node.js 10 declared in engines.node (EOL since 2021-04-30)
 *   - Two deprecated dependencies: `request` and `node-uuid`
 *   - No lockfile at the repo root
 *
 * We expect the assembled report to contain at least the findings:
 *   "node-eol", "deprecated-deps", "missing-lockfile"
 * and causeOfDeath must not be null.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import { extractNodeVersion } from '../../src/extract-node-version.js';
import { resolveLtsAlias } from '../../src/resolve-lts-alias.js';
import { capDependencies } from '../../src/autopsy/cap-dependencies.js';
import { resolveMinVersion } from '../../src/autopsy/resolve-min-version.js';
import { buildRuntimeFinding } from '../../src/autopsy/build-runtime-finding.js';
import { buildDepFindings, type DepResult } from '../../src/autopsy/build-dep-findings.js';
import { buildVulnFinding, type OsvVulnSummary } from '../../src/autopsy/build-vuln-finding.js';
import { buildHygieneFindings, type HygieneSignals } from '../../src/autopsy/build-hygiene-findings.js';
import { pickCauseOfDeath } from '../../src/autopsy/pick-cause-of-death.js';
import { assembleReport } from '../../src/autopsy/assemble-report.js';
import { buildNarrative } from '../../llm/none-provider.js';
import type { AutopsyFinding } from '../../src/types.js';

// ── Fixture paths ──────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../../../../fixtures/graves/dead-node-repo');

interface FixtureMeta {
  owner: string;
  name: string;
  archived: boolean;
  nvmrc: string | null;
}

interface FixturePackageJson {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function loadFixture(): { meta: FixtureMeta; pkg: FixturePackageJson } {
  const meta: FixtureMeta = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'meta.json'), 'utf8'),
  ) as FixtureMeta;
  const pkg: FixturePackageJson = JSON.parse(
    readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'),
  ) as FixturePackageJson;
  return { meta, pkg };
}

// ── Mocked network responses ───────────────────────────────────────────────────
// These represent what the real clients would return for this fixture's deps.
// They are defined here rather than fetched so the test has no network I/O.

/** EOL dates for Node.js majors — only v10 is relevant here. */
const MOCK_EOL_DATES: Record<number, string> = {
  10: '2021-04-30', // Node.js 10 reached EOL on 2021-04-30
};

/**
 * Returns the mocked EOL date for a Node.js major, or null if unknown.
 * Simulates what `eol.ts` would return for this fixture.
 */
function mockFetchEolDate(major: number): string | null {
  return MOCK_EOL_DATES[major] ?? null;
}

/**
 * Mocked npm registry results for the fixture's dependencies.
 * `request` and `node-uuid` are deprecated; `grunt` is not.
 */
function mockFetchDeprecatedAndLatest(
  capped: Record<string, string>,
): DepResult[] {
  const MOCK_NPM: Record<string, { deprecated: string | null; latest: string }> = {
    request: {
      deprecated: 'request has been deprecated, see https://github.com/request/request/issues/3142',
      latest: '2.88.2',
    },
    'node-uuid': {
      deprecated: 'Use uuid module instead.',
      latest: '1.4.8',
    },
    grunt: {
      deprecated: null,
      latest: '1.6.1',
    },
  };

  return Object.entries(capped).map(([name, declared]) => {
    const info = MOCK_NPM[name] ?? { deprecated: null, latest: null };
    return {
      name,
      declared,
      deprecated: info.deprecated,
      latest: info.latest,
      minVersion: resolveMinVersion(declared),
    };
  });
}

/**
 * Mocked OSV batch response — no known vulnerabilities for this fixture set,
 * so the vuln finding is omitted and the focus stays on the other three.
 */
function mockFetchVulnBatch(): OsvVulnSummary {
  return { critical: 0, high: 0, moderate: 0, low: 0, affectedPackages: 0 };
}

// ── Integration tests ──────────────────────────────────────────────────────────

describe('Autopsy integration – dead-node-repo fixture', () => {
  /**
   * Run the full autopsy pipeline (pure functions only, all I/O mocked)
   * and return the assembled AutopsyReport.
   */
  function runAutopsy() {
    const { meta, pkg } = loadFixture();

    // ── Step 1: Extract Node.js version ───────────────────────────────────────
    const enginesNode = pkg.engines?.node;
    const rawVersion = extractNodeVersion(enginesNode, meta.nvmrc ?? undefined);
    let majorVersion: number | null = null;
    if (rawVersion !== null) {
      if (/^lts\//i.test(rawVersion)) {
        majorVersion = resolveLtsAlias(rawVersion);
      } else {
        const parsed = parseInt(rawVersion, 10);
        majorVersion = isNaN(parsed) ? null : parsed;
      }
    }

    // ── Step 2: Collect and cap dependencies ──────────────────────────────────
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    const { capped, truncatedDepCount } = capDependencies(allDeps, 60);

    // ── Step 3: Mocked network fetches ────────────────────────────────────────
    const eolDate = majorVersion !== null ? mockFetchEolDate(majorVersion) : null;
    const depResults = mockFetchDeprecatedAndLatest(capped);
    const vulnSummary = mockFetchVulnBatch();

    // ── Step 4: Hygiene signals (from meta + absent lockfile) ─────────────────
    const hygieneSignals: HygieneSignals = {
      // The fixture directory contains no lockfile — simulates the real signal.
      hasLockfile: false,
      // The fixture package.json has no "scripts" field → no test script.
      hasTestScript: pkg.scripts?.['test'] !== undefined &&
        pkg.scripts['test'] !== 'echo "Error: no test specified" && exit 1',
      // No .travis.yml in the fixture — no dead-ci finding expected.
      hasTravisCi: false,
      hasGithubWorkflows: false,
      archived: meta.archived,
    };

    // ── Step 5: Pure builder functions ────────────────────────────────────────
    const runtimeFindings = buildRuntimeFinding(majorVersion, eolDate);
    const depFindings = buildDepFindings(depResults);
    const vulnFinding = buildVulnFinding(vulnSummary);
    const hygieneFindings = buildHygieneFindings(hygieneSignals);

    const allFindings: AutopsyFinding[] = [
      ...runtimeFindings,
      ...depFindings,
      ...(vulnFinding !== null ? [vulnFinding] : []),
      ...hygieneFindings,
    ];

    // ── Step 6: Cause of death + narrative ────────────────────────────────────
    const causeOfDeath = pickCauseOfDeath(allFindings);
    const narrative = buildNarrative({
      owner: meta.owner,
      name: meta.name,
      generatedAt: new Date().toISOString(),
      findings: allFindings,
      causeOfDeath,
      narrative: '',
      truncatedDepCount,
    });

    // ── Step 7: Assemble ──────────────────────────────────────────────────────
    return assembleReport(
      meta.owner,
      meta.name,
      allFindings,
      causeOfDeath,
      narrative,
      truncatedDepCount,
      new Date('2024-10-31T00:00:00.000Z'),
    );
  }

  it('assembles a report without throwing', () => {
    expect(() => runAutopsy()).not.toThrow();
  });

  it('report has the correct owner and name from the fixture', () => {
    const report = runAutopsy();
    expect(report.owner).toBe('ghost-dev');
    expect(report.name).toBe('ancient-widget');
  });

  it('report contains a "node-eol" finding (Node.js 10 is EOL)', () => {
    const report = runAutopsy();
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('node-eol');
  });

  it('node-eol finding is fatal severity', () => {
    const report = runAutopsy();
    const eolFinding = report.findings.find((f) => f.id === 'node-eol');
    expect(eolFinding?.severity).toBe('fatal');
  });

  it('node-eol finding evidence mentions the EOL date', () => {
    const report = runAutopsy();
    const eolFinding = report.findings.find((f) => f.id === 'node-eol');
    expect(eolFinding?.evidence).toContain('2021-04-30');
  });

  it('report contains a "deprecated-deps" finding (request and node-uuid are deprecated)', () => {
    const report = runAutopsy();
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('deprecated-deps');
  });

  it('deprecated-deps finding is fatal severity', () => {
    const report = runAutopsy();
    const depFinding = report.findings.find((f) => f.id === 'deprecated-deps');
    expect(depFinding?.severity).toBe('fatal');
  });

  it('deprecated-deps evidence mentions "request"', () => {
    const report = runAutopsy();
    const depFinding = report.findings.find((f) => f.id === 'deprecated-deps');
    expect(depFinding?.evidence).toContain('request');
  });

  it('report contains a "missing-lockfile" finding (no lockfile in fixture)', () => {
    const report = runAutopsy();
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('missing-lockfile');
  });

  it('missing-lockfile finding is serious severity', () => {
    const report = runAutopsy();
    const lockfileFinding = report.findings.find((f) => f.id === 'missing-lockfile');
    expect(lockfileFinding?.severity).toBe('serious');
  });

  it('causeOfDeath is not null', () => {
    const report = runAutopsy();
    expect(report.causeOfDeath).not.toBeNull();
  });

  it('causeOfDeath is one of the findings in the report', () => {
    const report = runAutopsy();
    expect(report.findings).toContain(report.causeOfDeath);
  });

  it('causeOfDeath is "node-eol" (highest-priority fatal finding for this fixture)', () => {
    const report = runAutopsy();
    expect(report.causeOfDeath?.id).toBe('node-eol');
  });

  it('narrative is a non-empty string', () => {
    const report = runAutopsy();
    expect(typeof report.narrative).toBe('string');
    expect(report.narrative.length).toBeGreaterThan(0);
  });

  it('narrative contains the cause-of-death title', () => {
    const report = runAutopsy();
    expect(report.narrative).toContain(report.causeOfDeath?.title ?? '');
  });

  it('truncatedDepCount is 0 (fixture has 3 deps, well below the 60 cap)', () => {
    const report = runAutopsy();
    expect(report.truncatedDepCount).toBe(0);
  });

  it('no known-vulns finding is produced (mocked OSV returns zero vulns)', () => {
    const report = runAutopsy();
    const ids = report.findings.map((f) => f.id);
    expect(ids).not.toContain('known-vulns');
  });

  it('generatedAt is a valid ISO 8601 UTC string', () => {
    const report = runAutopsy();
    expect(report.generatedAt).toBe('2024-10-31T00:00:00.000Z');
  });

  it('all findings have non-empty required string fields', () => {
    const report = runAutopsy();
    for (const finding of report.findings) {
      expect(finding.id.length).toBeGreaterThan(0);
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.fixHint.length).toBeGreaterThan(0);
    }
  });
});
