import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { buildRuntimeFinding } from '../../src/autopsy/build-runtime-finding.js';

afterEach(() => {
  vi.useRealTimers();
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('buildRuntimeFinding – unit tests', () => {
  it('returns [] when both majorVersion and eolDate are null', () => {
    expect(buildRuntimeFinding(null, null)).toEqual([]);
  });

  it('returns "node-version-unknown" (minor) when majorVersion is null but eolDate is provided', () => {
    const findings = buildRuntimeFinding(null, '2020-04-30');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('node-version-unknown');
    expect(findings[0]?.severity).toBe('minor');
    expect(findings[0]?.category).toBe('runtime');
  });

  it('returns "node-version-unknown" (minor) when majorVersion is 0 and eolDate is null', () => {
    const findings = buildRuntimeFinding(0, null);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('node-version-unknown');
    expect(findings[0]?.severity).toBe('minor');
  });

  it('returns [] when majorVersion is valid but eolDate is null (cannot determine EOL)', () => {
    expect(buildRuntimeFinding(18, null)).toEqual([]);
  });

  it('returns "node-eol" (fatal) when eolDate is in the past', () => {
    const findings = buildRuntimeFinding(12, '2022-04-30');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('node-eol');
    expect(findings[0]?.severity).toBe('fatal');
    expect(findings[0]?.category).toBe('runtime');
    expect(findings[0]?.evidence).toContain('12');
    expect(findings[0]?.evidence).toContain('2022-04-30');
  });

  it('returns [] when eolDate is in the future (healthy runtime)', () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(buildRuntimeFinding(22, future)).toEqual([]);
  });

  it('returns "node-eol" for EOL today (boundary: equal to now)', () => {
    // Set a fixed "now" via fake timers so the boundary is deterministic
    const fixedNow = new Date('2024-04-30T00:00:00.000Z');
    vi.setSystemTime(fixedNow);
    // eolDate exactly equal to now → EOL <= now → should be flagged
    const findings = buildRuntimeFinding(16, '2024-04-30');
    expect(findings[0]?.id).toBe('node-eol');
  });

  it('node-eol evidence contains the passed eolDate string verbatim', () => {
    const findings = buildRuntimeFinding(10, '2021-04-30');
    expect(findings[0]?.evidence).toContain('2021-04-30');
  });

  it('node-eol title contains the major version number', () => {
    const findings = buildRuntimeFinding(10, '2021-04-30');
    expect(findings[0]?.title).toContain('10');
  });

  it('node-version-unknown has non-empty fixHint', () => {
    const findings = buildRuntimeFinding(null, '2020-01-01');
    expect(findings[0]?.fixHint.length).toBeGreaterThan(0);
  });

  it('node-eol has non-empty fixHint', () => {
    const findings = buildRuntimeFinding(8, '2019-12-31');
    expect(findings[0]?.fixHint.length).toBeGreaterThan(0);
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('buildRuntimeFinding – property tests', () => {
  /** Output array length is always 0 or 1. */
  it('always returns 0 or 1 findings', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
        fc.option(fc.constantFrom('2019-12-31', '2099-12-31', '2024-01-01'), { nil: null }),
        (major, eol) => {
          const result = buildRuntimeFinding(major, eol);
          return result.length === 0 || result.length === 1;
        },
      ),
    );
  });

  /** Every returned finding has category "runtime". */
  it('every finding has category "runtime"', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
        fc.option(fc.constantFrom('2019-12-31', '2099-12-31'), { nil: null }),
        (major, eol) => {
          return buildRuntimeFinding(major, eol).every((f) => f.category === 'runtime');
        },
      ),
    );
  });

  /** When eolDate is in the future, finding is never "node-eol". */
  it('never produces node-eol for a future EOL date', () => {
    const futureDate = '2099-12-31';
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (major) => {
        return buildRuntimeFinding(major, futureDate).every((f) => f.id !== 'node-eol');
      }),
    );
  });

  /** When majorVersion is a positive integer and eolDate is in the past, the result is exactly ["node-eol"]. */
  it('always produces exactly one node-eol finding for a valid major + past EOL date', () => {
    const pastDate = '2019-12-31';
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (major) => {
        const result = buildRuntimeFinding(major, pastDate);
        return result.length === 1 && result[0]?.id === 'node-eol';
      }),
    );
  });

  /** Every returned finding has id, category, severity, title, evidence, and fixHint as non-empty strings. */
  it('every finding has all required string fields non-empty', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 99 }), { nil: null }),
        fc.option(fc.constantFrom('2019-12-31', '2099-12-31', '2022-06-01'), { nil: null }),
        (major, eol) => {
          return buildRuntimeFinding(major, eol).every(
            (f) =>
              f.id.length > 0 &&
              f.title.length > 0 &&
              f.evidence.length > 0 &&
              f.fixHint.length > 0,
          );
        },
      ),
    );
  });
});
