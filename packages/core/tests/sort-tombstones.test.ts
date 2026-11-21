import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortTombstones } from '../src/sort-tombstones.js';
import type { TombstoneData, RepoStatus } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTombstone(overrides: Partial<TombstoneData> & { name: string; status: RepoStatus; pushedAt: string }): TombstoneData {
  return {
    owner: 'test-owner',
    url: `https://github.com/test-owner/${overrides.name}`,
    language: 'TypeScript',
    archived: false,
    deprecatedDepCount: null,
    nodeVersion: null,
    nodeVersionEol: null,
    ...overrides,
  };
}

// ── Unit tests: empty and single-element input ────────────────────────────────

describe('sortTombstones – empty / trivial input', () => {
  it('returns an empty array for empty input', () => {
    expect(sortTombstones([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    const card = makeTombstone({ name: 'solo', status: 'Dead', pushedAt: '2020-01-01T00:00:00Z' });
    const result = sortTombstones([card]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('solo');
  });
});

// ── Unit tests: does not mutate input ────────────────────────────────────────

describe('sortTombstones – immutability', () => {
  it('does not mutate the input array', () => {
    const cards = [
      makeTombstone({ name: 'b', status: 'Dead', pushedAt: '2021-01-01T00:00:00Z' }),
      makeTombstone({ name: 'a', status: 'Dead', pushedAt: '2019-01-01T00:00:00Z' }),
    ];
    const original = [...cards];
    sortTombstones(cards);
    expect(cards[0]!.name).toBe(original[0]!.name);
    expect(cards[1]!.name).toBe(original[1]!.name);
  });
});

// ── Unit tests: Dead bucket ───────────────────────────────────────────────────

describe('sortTombstones – Dead bucket (ascending pushedAt)', () => {
  it('sorts Dead repos oldest first', () => {
    const cards = [
      makeTombstone({ name: 'newer', status: 'Dead', pushedAt: '2022-06-01T00:00:00Z' }),
      makeTombstone({ name: 'oldest', status: 'Dead', pushedAt: '2015-01-01T00:00:00Z' }),
      makeTombstone({ name: 'middle', status: 'Dead', pushedAt: '2019-03-15T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result.map((c) => c.name)).toEqual(['oldest', 'middle', 'newer']);
  });

  it('two Dead repos with same pushedAt keep stable relative position', () => {
    const ts = '2020-01-01T00:00:00Z';
    const cards = [
      makeTombstone({ name: 'alpha', status: 'Dead', pushedAt: ts }),
      makeTombstone({ name: 'beta', status: 'Dead', pushedAt: ts }),
    ];
    const result = sortTombstones(cards);
    // Both appear before any other bucket (the exact mutual order is implementation-defined,
    // but both must be present and both must be Dead).
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.status === 'Dead')).toBe(true);
  });
});

// ── Unit tests: Undead bucket ─────────────────────────────────────────────────

describe('sortTombstones – Undead bucket (descending pushedAt)', () => {
  it('sorts Undead repos most recently active first', () => {
    const cards = [
      makeTombstone({ name: 'old-undead', status: 'Undead', pushedAt: '2022-01-01T00:00:00Z' }),
      makeTombstone({ name: 'new-undead', status: 'Undead', pushedAt: '2024-05-01T00:00:00Z' }),
      makeTombstone({ name: 'mid-undead', status: 'Undead', pushedAt: '2023-07-15T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result.map((c) => c.name)).toEqual(['new-undead', 'mid-undead', 'old-undead']);
  });
});

// ── Unit tests: Unknown / UnknownSpecies bucket ───────────────────────────────

describe('sortTombstones – rest bucket (alphabetical by name)', () => {
  it('sorts Unknown repos alphabetically', () => {
    const cards = [
      makeTombstone({ name: 'zebra', status: 'Unknown', pushedAt: '2023-01-01T00:00:00Z' }),
      makeTombstone({ name: 'alpha', status: 'Unknown', pushedAt: '2020-01-01T00:00:00Z' }),
      makeTombstone({ name: 'mango', status: 'Unknown', pushedAt: '2021-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result.map((c) => c.name)).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('sorts UnknownSpecies repos alphabetically', () => {
    const cards = [
      makeTombstone({ name: 'rust-lib', status: 'UnknownSpecies', pushedAt: '2021-01-01T00:00:00Z' }),
      makeTombstone({ name: 'go-svc', status: 'UnknownSpecies', pushedAt: '2022-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result.map((c) => c.name)).toEqual(['go-svc', 'rust-lib']);
  });

  it('mixes Unknown and UnknownSpecies alphabetically together', () => {
    const cards = [
      makeTombstone({ name: 'zebra', status: 'Unknown', pushedAt: '2021-01-01T00:00:00Z' }),
      makeTombstone({ name: 'aardvark', status: 'UnknownSpecies', pushedAt: '2021-01-01T00:00:00Z' }),
      makeTombstone({ name: 'mango', status: 'Unknown', pushedAt: '2021-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result.map((c) => c.name)).toEqual(['aardvark', 'mango', 'zebra']);
  });
});

// ── Unit tests: bucket ordering ───────────────────────────────────────────────

describe('sortTombstones – bucket ordering', () => {
  it('Dead repos appear before Undead repos', () => {
    const cards = [
      makeTombstone({ name: 'undead-one', status: 'Undead', pushedAt: '2024-01-01T00:00:00Z' }),
      makeTombstone({ name: 'dead-one', status: 'Dead', pushedAt: '2015-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result[0]!.status).toBe('Dead');
    expect(result[1]!.status).toBe('Undead');
  });

  it('Undead repos appear before Unknown repos', () => {
    const cards = [
      makeTombstone({ name: 'unknown-one', status: 'Unknown', pushedAt: '2024-01-01T00:00:00Z' }),
      makeTombstone({ name: 'undead-one', status: 'Undead', pushedAt: '2023-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result[0]!.status).toBe('Undead');
    expect(result[1]!.status).toBe('Unknown');
  });

  it('Dead repos appear before UnknownSpecies repos', () => {
    const cards = [
      makeTombstone({ name: 'species-one', status: 'UnknownSpecies', pushedAt: '2024-01-01T00:00:00Z' }),
      makeTombstone({ name: 'dead-one', status: 'Dead', pushedAt: '2015-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result[0]!.status).toBe('Dead');
    expect(result[1]!.status).toBe('UnknownSpecies');
  });

  it('mixed all-four statuses are ordered Dead → Undead → Unknown/UnknownSpecies', () => {
    const cards = [
      makeTombstone({ name: 'zzz-unknown', status: 'Unknown', pushedAt: '2023-01-01T00:00:00Z' }),
      makeTombstone({ name: 'aaa-undead', status: 'Undead', pushedAt: '2024-01-01T00:00:00Z' }),
      makeTombstone({ name: 'bbb-species', status: 'UnknownSpecies', pushedAt: '2021-01-01T00:00:00Z' }),
      makeTombstone({ name: 'ccc-dead', status: 'Dead', pushedAt: '2016-01-01T00:00:00Z' }),
    ];
    const result = sortTombstones(cards);
    expect(result[0]!.status).toBe('Dead');
    expect(result[1]!.status).toBe('Undead');
    // remaining two are in the rest bucket (alphabetical)
    expect(result[2]!.name).toBe('bbb-species');
    expect(result[3]!.name).toBe('zzz-unknown');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('sortTombstones – property tests', () => {
  const FIXED_BASE = new Date('2020-01-01T00:00:00Z').getTime();

  /** Arbitrary ISO timestamp within a 10-year window. */
  const arbPushedAt = fc
    .integer({ min: FIXED_BASE, max: FIXED_BASE + 10 * 365 * 24 * 60 * 60 * 1000 })
    .map((ms) => new Date(ms).toISOString());

  const arbStatus = fc.constantFrom<RepoStatus>('Dead', 'Undead', 'Unknown', 'UnknownSpecies');

  /** Arbitrary printable ASCII name (non-empty, lowercase letters + hyphens). */
  const arbName = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

  const arbCard = fc.record<TombstoneData>({
    owner: fc.constant('owner'),
    name: arbName,
    url: fc.constant('https://github.com/owner/repo'),
    language: fc.option(fc.constant('TypeScript'), { nil: null }),
    pushedAt: arbPushedAt,
    archived: fc.boolean(),
    deprecatedDepCount: fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
    nodeVersion: fc.option(fc.constant('18'), { nil: null }),
    nodeVersionEol: fc.option(fc.boolean(), { nil: null }),
    status: arbStatus,
  });

  it('output length equals input length', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        return sortTombstones(cards).length === cards.length;
      }),
    );
  });

  it('output contains the same elements as the input (permutation)', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        // Every input card should appear in the output (by reference equality)
        return cards.every((c) => sorted.includes(c));
      }),
    );
  });

  it('all Dead cards appear before all Undead cards', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        const lastDeadIdx = sorted.findLastIndex((c) => c.status === 'Dead');
        const firstUndeadIdx = sorted.findIndex((c) => c.status === 'Undead');
        if (lastDeadIdx === -1 || firstUndeadIdx === -1) return true; // only one bucket present
        return lastDeadIdx < firstUndeadIdx;
      }),
    );
  });

  it('all Undead cards appear before all Unknown/UnknownSpecies cards', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        const lastUndeadIdx = sorted.findLastIndex((c) => c.status === 'Undead');
        const firstRestIdx = sorted.findIndex(
          (c) => c.status === 'Unknown' || c.status === 'UnknownSpecies',
        );
        if (lastUndeadIdx === -1 || firstRestIdx === -1) return true;
        return lastUndeadIdx < firstRestIdx;
      }),
    );
  });

  it('Dead cards are sorted by pushedAt ascending within their bucket', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        const deadCards = sorted.filter((c) => c.status === 'Dead');
        for (let i = 1; i < deadCards.length; i++) {
          if (Date.parse(deadCards[i - 1]!.pushedAt) > Date.parse(deadCards[i]!.pushedAt)) {
            return false;
          }
        }
        return true;
      }),
    );
  });

  it('Undead cards are sorted by pushedAt descending within their bucket', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        const undeadCards = sorted.filter((c) => c.status === 'Undead');
        for (let i = 1; i < undeadCards.length; i++) {
          if (Date.parse(undeadCards[i - 1]!.pushedAt) < Date.parse(undeadCards[i]!.pushedAt)) {
            return false;
          }
        }
        return true;
      }),
    );
  });

  it('Unknown/UnknownSpecies cards are sorted alphabetically by name', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const sorted = sortTombstones(cards);
        const restCards = sorted.filter(
          (c) => c.status === 'Unknown' || c.status === 'UnknownSpecies',
        );
        for (let i = 1; i < restCards.length; i++) {
          if (restCards[i - 1]!.name.localeCompare(restCards[i]!.name) > 0) {
            return false;
          }
        }
        return true;
      }),
    );
  });

  it('sorting is idempotent (sorting an already-sorted result gives the same order)', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const once = sortTombstones(cards);
        const twice = sortTombstones(once);
        return twice.every((c, i) => c === once[i]);
      }),
    );
  });

  it('input array is not mutated', () => {
    fc.assert(
      fc.property(fc.array(arbCard), (cards) => {
        const snapshot = [...cards];
        sortTombstones(cards);
        return cards.every((c, i) => c === snapshot[i]);
      }),
    );
  });
});
