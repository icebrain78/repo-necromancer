/**
 * End-to-end smoke test for the Graveyard pipeline.
 *
 * Uses fixture data from fixtures/graves/ to simulate the data that the web
 * layer assembles from GitHub, the npm registry, and endoflife.date.  All
 * external I/O results are pre-baked into the fixtures; this test exercises
 * only the pure core functions to ensure they compose correctly.
 *
 * Pipeline under test:
 *   fixture meta + package.json
 *       └─► isNodeRepo
 *       └─► extractNodeVersion + resolveLtsAlias  (→ majorVersion string)
 *       └─► classifyRepo (with injected EOL / deprecated-count signals)
 *       └─► sortTombstones
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { isNodeRepo } from '../src/detect-node.js';
import { extractNodeVersion } from '../src/extract-node-version.js';
import { resolveLtsAlias } from '../src/resolve-lts-alias.js';
import { classifyRepo } from '../src/classify-repo.js';
import { sortTombstones } from '../src/sort-tombstones.js';
import type { RepoSignals, TombstoneData, RepoStatus } from '../src/types.js';

// ── Path helpers ─────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// packages/core/tests → ../../fixtures/graves
const FIXTURES_ROOT = join(__dirname, '../../../fixtures/graves');

// ── Fixture types ─────────────────────────────────────────────────────────────

interface FixtureMeta {
  owner: string;
  name: string;
  language: string | null;
  pushedAt: string;
  archived: boolean;
  nvmrc: string | null;
}

interface FixturePackageJson {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// ── Fixture loader ─────────────────────────────────────────────────────────────

function loadMeta(fixture: string): FixtureMeta {
  const raw = readFileSync(join(FIXTURES_ROOT, fixture, 'meta.json'), 'utf-8');
  return JSON.parse(raw) as FixtureMeta;
}

function loadPackageJson(fixture: string): FixturePackageJson | null {
  try {
    const raw = readFileSync(join(FIXTURES_ROOT, fixture, 'package.json'), 'utf-8');
    return JSON.parse(raw) as FixturePackageJson;
  } catch {
    return null;
  }
}

/**
 * Fixed reference timestamp used throughout all tests so results are
 * deterministic regardless of when the suite runs.
 *
 * Value: 2026-11-21T00:00:00Z
 *   - dead-node-repo pushedAt 2019-03-10  → ~7.7 years ago → Dead (stale)
 *   - undead-node-repo pushedAt 2025-11-01 → ~0.1 years ago → not stale
 */
const FIXED_NOW = new Date('2026-11-21T00:00:00Z').getTime();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the Node.js major version string (e.g. "18") from fixture data,
 * mirroring what the server component does:
 *   1. extractNodeVersion(engines.node, nvmrc)
 *   2. if the result looks like an lts/ alias, resolveLtsAlias → numeric string
 */
function resolveFixtureNodeVersion(
  pkg: FixturePackageJson | null,
  nvmrc: string | null,
): string | null {
  const enginesNode = pkg?.engines?.node;
  const rawVersion = extractNodeVersion(enginesNode, nvmrc ?? undefined);
  if (rawVersion === null) return null;

  // If extractNodeVersion returned an lts/ alias string, resolve it.
  if (/^lts\//i.test(rawVersion)) {
    const major = resolveLtsAlias(rawVersion);
    return major !== null ? String(major) : null;
  }

  return rawVersion;
}

/**
 * Builds a TombstoneData from a fixture, with pre-baked EOL and deprecated
 * signals injected by the test (simulating what the server component learns
 * from endoflife.date and the npm registry).
 *
 * Uses FIXED_NOW so results are deterministic.
 */
function buildTombstone(
  fixture: string,
  injectedSignals: { nodeVersionEol: boolean | null; deprecatedDepCount: number | null },
): TombstoneData {
  const meta = loadMeta(fixture);
  const pkg = loadPackageJson(fixture);

  const hasPackageJson = pkg !== null;
  const nodeRepo = isNodeRepo(meta.language, hasPackageJson);
  const nodeVersion = nodeRepo ? resolveFixtureNodeVersion(pkg, meta.nvmrc) : null;

  const signals: RepoSignals = {
    pushedAt: meta.pushedAt,
    archived: meta.archived,
    isNodeRepo: nodeRepo,
    deprecatedDepCount: injectedSignals.deprecatedDepCount,
    nodeVersionEol: injectedSignals.nodeVersionEol,
  };

  const status = classifyRepo(signals, FIXED_NOW);

  return {
    owner: meta.owner,
    name: meta.name,
    url: `https://github.com/${meta.owner}/${meta.name}`,
    language: meta.language,
    pushedAt: meta.pushedAt,
    archived: meta.archived,
    deprecatedDepCount: injectedSignals.deprecatedDepCount,
    nodeVersion,
    nodeVersionEol: injectedSignals.nodeVersionEol,
    status,
  };
}

// ── Fixture smoke tests ──────────────────────────────────────────────────────

describe('graveyard integration – fixture: dead-node-repo', () => {
  const fixture = 'dead-node-repo';

  it('loads fixture files without error', () => {
    expect(() => loadMeta(fixture)).not.toThrow();
    expect(() => loadPackageJson(fixture)).not.toThrow();
  });

  it('detects the repo as a Node.js repo', () => {
    const meta = loadMeta(fixture);
    const pkg = loadPackageJson(fixture);
    expect(isNodeRepo(meta.language, pkg !== null)).toBe(true);
  });

  it('extracts the Node.js major version from engines.node', () => {
    const pkg = loadPackageJson(fixture);
    const version = resolveFixtureNodeVersion(pkg, null);
    // engines.node is ">=10.0.0" → major "10"
    expect(version).toBe('10');
  });

  it('classifies as Dead when EOL is true', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: true,
      deprecatedDepCount: 2,
    });
    expect(tombstone.status).toBe('Dead');
  });

  it('classifies as Dead on stale pushedAt alone (even with eol=false, 0 deps)', () => {
    // pushedAt is 2019-03-10, more than 2 years before now → Dead
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: false,
      deprecatedDepCount: 0,
    });
    expect(tombstone.status).toBe('Dead');
  });

  it('tombstone carries the correct metadata', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: true,
      deprecatedDepCount: 2,
    });
    expect(tombstone.owner).toBe('ghost-dev');
    expect(tombstone.name).toBe('ancient-widget');
    expect(tombstone.language).toBe('JavaScript');
    expect(tombstone.archived).toBe(false);
    expect(tombstone.url).toBe('https://github.com/ghost-dev/ancient-widget');
  });
});

describe('graveyard integration – fixture: undead-node-repo', () => {
  const fixture = 'undead-node-repo';

  it('loads fixture files without error', () => {
    expect(() => loadMeta(fixture)).not.toThrow();
    expect(() => loadPackageJson(fixture)).not.toThrow();
  });

  it('detects the repo as a Node.js repo', () => {
    const meta = loadMeta(fixture);
    const pkg = loadPackageJson(fixture);
    expect(isNodeRepo(meta.language, pkg !== null)).toBe(true);
  });

  it('extracts the Node.js major version from engines.node', () => {
    const pkg = loadPackageJson(fixture);
    const version = resolveFixtureNodeVersion(pkg, null);
    // engines.node is ">=22.0.0" → major "22"
    expect(version).toBe('22');
  });

  it('classifies as Undead when all signals are known and benign', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: false,
      deprecatedDepCount: 0,
    });
    expect(tombstone.status).toBe('Undead');
  });

  it('classifies as Unknown when EOL signal is not yet resolved', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: null,
      deprecatedDepCount: 0,
    });
    expect(tombstone.status).toBe('Unknown');
  });

  it('tombstone carries the correct metadata', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: false,
      deprecatedDepCount: 0,
    });
    expect(tombstone.owner).toBe('healthy-dev');
    expect(tombstone.name).toBe('living-service');
    expect(tombstone.language).toBe('TypeScript');
    expect(tombstone.nodeVersion).toBe('22');
    expect(tombstone.url).toBe('https://github.com/healthy-dev/living-service');
    expect(tombstone.pushedAt).toBe('2025-11-01T10:00:00Z');
  });
});

describe('graveyard integration – fixture: non-node-repo', () => {
  const fixture = 'non-node-repo';

  it('loads fixture meta without error', () => {
    expect(() => loadMeta(fixture)).not.toThrow();
  });

  it('has no package.json', () => {
    expect(loadPackageJson(fixture)).toBeNull();
  });

  it('detects the repo as NOT a Node.js repo', () => {
    const meta = loadMeta(fixture);
    expect(isNodeRepo(meta.language, false)).toBe(false);
  });

  it('classifies as UnknownSpecies regardless of injected signals', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: true,
      deprecatedDepCount: 10,
    });
    expect(tombstone.status).toBe('UnknownSpecies');
  });

  it('tombstone carries the correct metadata', () => {
    const tombstone = buildTombstone(fixture, {
      nodeVersionEol: null,
      deprecatedDepCount: null,
    });
    expect(tombstone.owner).toBe('rust-dev');
    expect(tombstone.name).toBe('ferris-crate');
    expect(tombstone.language).toBe('Rust');
    expect(tombstone.nodeVersion).toBeNull();
  });
});

// ── nvmrc extraction smoke test ───────────────────────────────────────────────

describe('graveyard integration – nvmrc extraction', () => {
  it('extracts major version from a plain version nvmrc', () => {
    const version = extractNodeVersion(undefined, 'v18.12.0\n');
    expect(version).toBe('18');
  });

  it('extracts major version from an lts alias nvmrc', () => {
    const raw = extractNodeVersion(undefined, 'lts/hydrogen\n');
    expect(raw).toBe('lts/hydrogen');
    const resolved = resolveLtsAlias(raw!);
    expect(resolved).toBe(18);
  });

  it('engines.node takes priority over nvmrc', () => {
    // engines says 20, nvmrc says 16 → should return 20
    const version = extractNodeVersion('>=20.0.0', 'v16\n');
    expect(version).toBe('20');
  });

  it('falls back to nvmrc when engines.node is absent', () => {
    const version = extractNodeVersion(undefined, '20\n');
    expect(version).toBe('20');
  });

  it('returns null when neither source is present', () => {
    expect(extractNodeVersion(undefined, undefined)).toBeNull();
  });
});

// ── Full pipeline: sortTombstones over all three fixtures ─────────────────────

describe('graveyard integration – full pipeline sort', () => {
  it('sorts Dead before Undead before UnknownSpecies', () => {
    const deadTombstone = buildTombstone('dead-node-repo', {
      nodeVersionEol: true,
      deprecatedDepCount: 2,
    });
    const undeadTombstone = buildTombstone('undead-node-repo', {
      nodeVersionEol: false,
      deprecatedDepCount: 0,
    });
    const speciesTombstone = buildTombstone('non-node-repo', {
      nodeVersionEol: null,
      deprecatedDepCount: null,
    });

    // Verify pre-conditions
    expect(deadTombstone.status).toBe('Dead');
    expect(undeadTombstone.status).toBe('Undead');
    expect(speciesTombstone.status).toBe('UnknownSpecies');

    const sorted = sortTombstones([speciesTombstone, undeadTombstone, deadTombstone]);

    expect(sorted[0]!.status).toBe('Dead');
    expect(sorted[1]!.status).toBe('Undead');
    expect(sorted[2]!.status).toBe('UnknownSpecies');
  });

  it('sorted result is a permutation of the input (no cards lost or duplicated)', () => {
    const cards: TombstoneData[] = [
      buildTombstone('dead-node-repo', { nodeVersionEol: true, deprecatedDepCount: 2 }),
      buildTombstone('undead-node-repo', { nodeVersionEol: false, deprecatedDepCount: 0 }),
      buildTombstone('non-node-repo', { nodeVersionEol: null, deprecatedDepCount: null }),
    ];

    const sorted = sortTombstones(cards);

    expect(sorted).toHaveLength(cards.length);
    expect(cards.every((c) => sorted.includes(c))).toBe(true);
  });

  it('a grid of only Dead repos is sorted oldest-push first', () => {
    // Build two dead tombstones with different pushedAt dates
    const older = buildTombstone('dead-node-repo', { nodeVersionEol: true, deprecatedDepCount: 2 });
    // Synthesise a second Dead tombstone with a more recent (but still stale) date
    const newer: TombstoneData = {
      ...older,
      name: 'less-ancient-widget',
      pushedAt: '2021-01-01T00:00:00Z',
      // 2021-01-01 is > 2 years before 2026-11-21, so still Dead
    };

    const sorted = sortTombstones([newer, older]);

    expect(sorted[0]!.pushedAt).toBe(older.pushedAt);  // 2019 before 2021
    expect(sorted[1]!.pushedAt).toBe(newer.pushedAt);
  });

  it('the full pipeline output has correct statuses for each named fixture', () => {
    const tombstones = [
      buildTombstone('dead-node-repo', { nodeVersionEol: true, deprecatedDepCount: 2 }),
      buildTombstone('undead-node-repo', { nodeVersionEol: false, deprecatedDepCount: 0 }),
      buildTombstone('non-node-repo', { nodeVersionEol: null, deprecatedDepCount: null }),
    ];

    const sorted = sortTombstones(tombstones);
    const byName = Object.fromEntries(sorted.map((t) => [t.name, t.status])) as Record<string, RepoStatus>;

    expect(byName['ancient-widget']).toBe('Dead');
    expect(byName['living-service']).toBe('Undead');
    expect(byName['ferris-crate']).toBe('UnknownSpecies');
  });
});
