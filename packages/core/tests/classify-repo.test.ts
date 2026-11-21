import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyRepo } from '../src/classify-repo.js';
import type { RepoSignals } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns an ISO timestamp for `daysAgo` days before `now`. */
function daysAgo(days: number, now: number = Date.now()): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

/** A healthy Node.js repo baseline with all signals benign and known. */
function healthySignals(overrides: Partial<RepoSignals> = {}): RepoSignals {
  return {
    isNodeRepo: true,
    archived: false,
    pushedAt: daysAgo(30),
    nodeVersionEol: false,
    deprecatedDepCount: 0,
    ...overrides,
  };
}

// ── Unit tests: UnknownSpecies ───────────────────────────────────────────────

describe('classifyRepo – UnknownSpecies', () => {
  it('returns UnknownSpecies when isNodeRepo is false', () => {
    const signals: RepoSignals = {
      isNodeRepo: false,
      archived: false,
      pushedAt: daysAgo(10),
      nodeVersionEol: null,
      deprecatedDepCount: null,
    };
    expect(classifyRepo(signals)).toBe('UnknownSpecies');
  });

  it('returns UnknownSpecies even when other signals look dead', () => {
    const signals: RepoSignals = {
      isNodeRepo: false,
      archived: true,
      pushedAt: daysAgo(1000),
      nodeVersionEol: true,
      deprecatedDepCount: 5,
    };
    expect(classifyRepo(signals)).toBe('UnknownSpecies');
  });
});

// ── Unit tests: Dead ─────────────────────────────────────────────────────────

describe('classifyRepo – Dead triggers', () => {
  it('archived === true → Dead', () => {
    expect(classifyRepo(healthySignals({ archived: true }))).toBe('Dead');
  });

  it('pushedAt > 2 years ago → Dead', () => {
    // 2 * 365.25 days + 1 day to be unambiguously past the threshold
    expect(classifyRepo(healthySignals({ pushedAt: daysAgo(732) }))).toBe('Dead');
  });

  it('nodeVersionEol === true → Dead', () => {
    expect(classifyRepo(healthySignals({ nodeVersionEol: true }))).toBe('Dead');
  });

  it('deprecatedDepCount >= 1 → Dead', () => {
    expect(classifyRepo(healthySignals({ deprecatedDepCount: 1 }))).toBe('Dead');
  });

  it('deprecatedDepCount > 1 → Dead', () => {
    expect(classifyRepo(healthySignals({ deprecatedDepCount: 10 }))).toBe('Dead');
  });

  it('single trigger is sufficient even when other signals are null', () => {
    const signals: RepoSignals = {
      isNodeRepo: true,
      archived: true,
      pushedAt: daysAgo(1),
      nodeVersionEol: null,
      deprecatedDepCount: null,
    };
    expect(classifyRepo(signals)).toBe('Dead');
  });

  it('stale repo with unknown eol and deps → Dead (not Unknown)', () => {
    const signals: RepoSignals = {
      isNodeRepo: true,
      archived: false,
      pushedAt: daysAgo(800),
      nodeVersionEol: null,
      deprecatedDepCount: null,
    };
    expect(classifyRepo(signals)).toBe('Dead');
  });

  it('EOL trigger fires even when deprecated count is null', () => {
    const signals: RepoSignals = {
      isNodeRepo: true,
      archived: false,
      pushedAt: daysAgo(10),
      nodeVersionEol: true,
      deprecatedDepCount: null,
    };
    expect(classifyRepo(signals)).toBe('Dead');
  });

  it('deprecated trigger fires even when eol is null', () => {
    const signals: RepoSignals = {
      isNodeRepo: true,
      archived: false,
      pushedAt: daysAgo(10),
      nodeVersionEol: null,
      deprecatedDepCount: 3,
    };
    expect(classifyRepo(signals)).toBe('Dead');
  });
});

// ── Unit tests: staleness boundary ───────────────────────────────────────────

describe('classifyRepo – staleness boundary', () => {
  const FIXED_NOW = new Date('2024-06-01T00:00:00Z').getTime();
  const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;

  it('exactly at two-year boundary is not stale (equal, not greater-than)', () => {
    const pushedAt = new Date(FIXED_NOW - TWO_YEARS_MS).toISOString();
    const signals = healthySignals({ pushedAt });
    // exactly equal → NOT > threshold → not Dead on staleness alone
    expect(classifyRepo(signals, FIXED_NOW)).toBe('Undead');
  });

  it('one millisecond past the boundary is stale → Dead', () => {
    const pushedAt = new Date(FIXED_NOW - TWO_YEARS_MS - 1).toISOString();
    const signals = healthySignals({ pushedAt });
    expect(classifyRepo(signals, FIXED_NOW)).toBe('Dead');
  });

  it('1 day before the boundary is not stale → Undead', () => {
    const pushedAt = new Date(FIXED_NOW - TWO_YEARS_MS + 24 * 60 * 60 * 1000).toISOString();
    const signals = healthySignals({ pushedAt });
    expect(classifyRepo(signals, FIXED_NOW)).toBe('Undead');
  });
});

// ── Unit tests: Undead ───────────────────────────────────────────────────────

describe('classifyRepo – Undead', () => {
  it('all signals known and benign → Undead', () => {
    expect(classifyRepo(healthySignals())).toBe('Undead');
  });

  it('pushed exactly 1 day ago with clean signals → Undead', () => {
    expect(classifyRepo(healthySignals({ pushedAt: daysAgo(1) }))).toBe('Undead');
  });

  it('zero deprecated deps (not null) → Undead', () => {
    expect(classifyRepo(healthySignals({ deprecatedDepCount: 0 }))).toBe('Undead');
  });
});

// ── Unit tests: Unknown ──────────────────────────────────────────────────────

describe('classifyRepo – Unknown', () => {
  it('eol is null but no trigger fires → Unknown', () => {
    expect(classifyRepo(healthySignals({ nodeVersionEol: null }))).toBe('Unknown');
  });

  it('deprecatedDepCount is null but no trigger fires → Unknown', () => {
    expect(classifyRepo(healthySignals({ deprecatedDepCount: null }))).toBe('Unknown');
  });

  it('both eol and deprecatedDepCount null but no trigger fires → Unknown', () => {
    const signals: RepoSignals = {
      isNodeRepo: true,
      archived: false,
      pushedAt: daysAgo(10),
      nodeVersionEol: null,
      deprecatedDepCount: null,
    };
    expect(classifyRepo(signals)).toBe('Unknown');
  });
});

// ── Property-based tests ─────────────────────────────────────────────────────

describe('classifyRepo – property tests', () => {
  const FIXED_NOW = new Date('2024-06-01T00:00:00Z').getTime();
  const TWO_YEARS_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;

  /** Arbitrary ISO timestamp within ±10 years of FIXED_NOW. */
  const arbPushedAt = fc
    .integer({ min: FIXED_NOW - 10 * 365 * 24 * 60 * 60 * 1000, max: FIXED_NOW })
    .map((ms) => new Date(ms).toISOString());

  /** Arbitrary nullable boolean. */
  const arbNullableBoolean = fc.option(fc.boolean(), { nil: null });

  /** Arbitrary nullable non-negative integer. */
  const arbNullableCount = fc.option(fc.integer({ min: 0, max: 100 }), { nil: null });

  it('always returns UnknownSpecies when isNodeRepo is false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),       // archived
        arbPushedAt,        // pushedAt
        arbNullableBoolean, // nodeVersionEol
        arbNullableCount,   // deprecatedDepCount
        (archived, pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: false,
            archived,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          return classifyRepo(signals, FIXED_NOW) === 'UnknownSpecies';
        },
      ),
    );
  });

  it('never returns UnknownSpecies when isNodeRepo is true', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        arbPushedAt,
        arbNullableBoolean,
        arbNullableCount,
        (archived, pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          const result = classifyRepo(signals, FIXED_NOW);
          return result !== 'UnknownSpecies';
        },
      ),
    );
  });

  it('archived === true always yields Dead (for Node repos)', () => {
    fc.assert(
      fc.property(
        arbPushedAt,
        arbNullableBoolean,
        arbNullableCount,
        (pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived: true,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          return classifyRepo(signals, FIXED_NOW) === 'Dead';
        },
      ),
    );
  });

  it('stale pushedAt always yields Dead (for Node repos, non-archived)', () => {
    // pushedAt more than TWO_YEARS_MS before FIXED_NOW
    const arbStalePushedAt = fc
      .integer({ min: FIXED_NOW - 10 * 365 * 24 * 60 * 60 * 1000, max: FIXED_NOW - TWO_YEARS_MS - 1 })
      .map((ms) => new Date(ms).toISOString());

    fc.assert(
      fc.property(
        arbStalePushedAt,
        arbNullableBoolean,
        arbNullableCount,
        (pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived: false,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          return classifyRepo(signals, FIXED_NOW) === 'Dead';
        },
      ),
    );
  });

  it('EOL true always yields Dead (for Node repos, non-archived, fresh)', () => {
    // pushedAt within 2 years to isolate EOL trigger
    const arbFreshPushedAt = fc
      .integer({ min: FIXED_NOW - TWO_YEARS_MS, max: FIXED_NOW })
      .map((ms) => new Date(ms).toISOString());

    fc.assert(
      fc.property(
        arbFreshPushedAt,
        arbNullableCount,
        (pushedAt, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived: false,
            pushedAt,
            nodeVersionEol: true,
            deprecatedDepCount,
          };
          return classifyRepo(signals, FIXED_NOW) === 'Dead';
        },
      ),
    );
  });

  it('positive deprecated count always yields Dead (for Node repos, non-archived, fresh, non-EOL)', () => {
    const arbFreshPushedAt = fc
      .integer({ min: FIXED_NOW - TWO_YEARS_MS, max: FIXED_NOW })
      .map((ms) => new Date(ms).toISOString());

    fc.assert(
      fc.property(
        arbFreshPushedAt,
        fc.integer({ min: 1, max: 1000 }),
        (pushedAt, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived: false,
            pushedAt,
            nodeVersionEol: false,
            deprecatedDepCount,
          };
          return classifyRepo(signals, FIXED_NOW) === 'Dead';
        },
      ),
    );
  });

  it('all signals known and benign always yields Undead', () => {
    // Fresh pushedAt: within [FIXED_NOW - TWO_YEARS_MS, FIXED_NOW] (inclusive boundary is not Dead)
    const arbFreshPushedAt = fc
      .integer({ min: FIXED_NOW - TWO_YEARS_MS, max: FIXED_NOW })
      .map((ms) => new Date(ms).toISOString());

    fc.assert(
      fc.property(
        arbFreshPushedAt,
        (pushedAt) => {
          const signals: RepoSignals = {
            isNodeRepo: true,
            archived: false,
            pushedAt,
            nodeVersionEol: false,
            deprecatedDepCount: 0,
          };
          return classifyRepo(signals, FIXED_NOW) === 'Undead';
        },
      ),
    );
  });

  it('result is always one of the four valid RepoStatus values', () => {
    const valid = new Set(['Dead', 'Undead', 'Unknown', 'UnknownSpecies']);
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        arbPushedAt,
        arbNullableBoolean,
        arbNullableCount,
        (isNodeRepo, archived, pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo,
            archived,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          return valid.has(classifyRepo(signals, FIXED_NOW));
        },
      ),
    );
  });

  it('classification is consistent across repeated calls with the same inputs', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        arbPushedAt,
        arbNullableBoolean,
        arbNullableCount,
        (isNodeRepo, archived, pushedAt, nodeVersionEol, deprecatedDepCount) => {
          const signals: RepoSignals = {
            isNodeRepo,
            archived,
            pushedAt,
            nodeVersionEol,
            deprecatedDepCount,
          };
          return (
            classifyRepo(signals, FIXED_NOW) === classifyRepo(signals, FIXED_NOW)
          );
        },
      ),
    );
  });
});
