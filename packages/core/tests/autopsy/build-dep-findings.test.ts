import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildDepFindings,
  type DepResult,
} from '../../src/autopsy/build-dep-findings.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(
  overrides: Partial<DepResult> & { name: string },
): DepResult {
  return {
    declared: '^1.0.0',
    deprecated: null,
    latest: '1.2.3',
    minVersion: '1.0.0',
    ...overrides,
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('buildDepFindings – unit tests', () => {
  it('returns [] for an empty array', () => {
    expect(buildDepFindings([])).toEqual([]);
  });

  it('returns [] when no deps are deprecated or outdated', () => {
    const results = [
      makeResult({ name: 'react', declared: '^18.0.0', latest: '18.3.0', minVersion: '18.0.0' }),
      makeResult({ name: 'lodash', declared: '^4.17.0', latest: '4.17.21', minVersion: '4.17.0' }),
    ];
    expect(buildDepFindings(results)).toEqual([]);
  });

  // ── Deprecated-deps finding ─────────────────────────────────────────────────

  it('produces a deprecated-deps finding (fatal) when a dep is deprecated', () => {
    const results = [
      makeResult({ name: 'request', deprecated: 'request is deprecated' }),
    ];
    const findings = buildDepFindings(results);
    const dep = findings.find((f) => f.id === 'deprecated-deps');
    expect(dep).toBeDefined();
    expect(dep?.severity).toBe('fatal');
    expect(dep?.category).toBe('deprecated-deps');
  });

  it('evidence contains the deprecated package name and message', () => {
    const results = [
      makeResult({ name: 'mkdirp', deprecated: 'Legacy versions of mkdirp are no longer supported.' }),
    ];
    const findings = buildDepFindings(results);
    const dep = findings.find((f) => f.id === 'deprecated-deps');
    expect(dep?.evidence).toContain('mkdirp');
    expect(dep?.evidence).toContain('Legacy versions');
  });

  it('evidence for multiple deprecated deps is comma-separated', () => {
    const results = [
      makeResult({ name: 'request', deprecated: 'deprecated' }),
      makeResult({ name: 'left-pad', deprecated: 'left-pad is deprecated' }),
    ];
    const findings = buildDepFindings(results);
    const dep = findings.find((f) => f.id === 'deprecated-deps');
    expect(dep?.evidence).toContain('request');
    expect(dep?.evidence).toContain('left-pad');
  });

  it('truncates evidence at 200 chars with ellipsis', () => {
    const longMessage = 'x'.repeat(300);
    const results = [
      makeResult({ name: 'pkg', deprecated: longMessage }),
    ];
    const findings = buildDepFindings(results);
    const dep = findings.find((f) => f.id === 'deprecated-deps');
    expect(dep?.evidence.length).toBeLessThanOrEqual(200);
    expect(dep?.evidence.endsWith('...')).toBe(true);
  });

  it('ignores deps with deprecated: null', () => {
    const results = [
      makeResult({ name: 'express', deprecated: null }),
    ];
    expect(buildDepFindings(results).find((f) => f.id === 'deprecated-deps')).toBeUndefined();
  });

  it('ignores deps with deprecated: "" (empty string)', () => {
    const results = [
      makeResult({ name: 'express', deprecated: '' }),
    ];
    expect(buildDepFindings(results).find((f) => f.id === 'deprecated-deps')).toBeUndefined();
  });

  // ── Outdated-majors finding ─────────────────────────────────────────────────

  it('produces an outdated-majors finding (serious) when latest major > minVersion major', () => {
    const results = [
      makeResult({ name: 'react', declared: '^15.0.0', latest: '18.3.0', minVersion: '15.0.0' }),
    ];
    const findings = buildDepFindings(results);
    const outdated = findings.find((f) => f.id === 'outdated-majors');
    expect(outdated).toBeDefined();
    expect(outdated?.severity).toBe('serious');
    expect(outdated?.category).toBe('outdated-majors');
  });

  it('evidence contains the package name and version arrow', () => {
    const results = [
      makeResult({ name: 'webpack', declared: '^4.0.0', latest: '5.91.0', minVersion: '4.0.0' }),
    ];
    const findings = buildDepFindings(results);
    const outdated = findings.find((f) => f.id === 'outdated-majors');
    expect(outdated?.evidence).toContain('webpack');
    expect(outdated?.evidence).toContain('→');
  });

  it('caps outdated-majors evidence at 10 packages', () => {
    const results = Array.from({ length: 15 }, (_, i) =>
      makeResult({ name: `pkg${i}`, declared: `^${i}.0.0`, latest: `${i + 2}.0.0`, minVersion: `${i}.0.0` }),
    );
    const findings = buildDepFindings(results);
    const outdated = findings.find((f) => f.id === 'outdated-majors');
    // Count "→" occurrences — should be at most 10
    const arrowCount = (outdated?.evidence.match(/→/g) ?? []).length;
    expect(arrowCount).toBeLessThanOrEqual(10);
  });

  it('does not produce outdated-majors when same major', () => {
    const results = [
      makeResult({ name: 'lodash', declared: '^4.0.0', latest: '4.17.21', minVersion: '4.0.0' }),
    ];
    expect(buildDepFindings(results).find((f) => f.id === 'outdated-majors')).toBeUndefined();
  });

  it('does not produce outdated-majors when latest is null', () => {
    const results = [
      makeResult({ name: 'pkg', declared: '^1.0.0', latest: null, minVersion: '1.0.0' }),
    ];
    expect(buildDepFindings(results).find((f) => f.id === 'outdated-majors')).toBeUndefined();
  });

  it('does not produce outdated-majors when minVersion is null', () => {
    const results = [
      makeResult({ name: 'pkg', declared: 'latest', latest: '5.0.0', minVersion: null }),
    ];
    expect(buildDepFindings(results).find((f) => f.id === 'outdated-majors')).toBeUndefined();
  });

  // ── Both findings ───────────────────────────────────────────────────────────

  it('can return both deprecated-deps and outdated-majors from the same input', () => {
    const results = [
      makeResult({ name: 'request', deprecated: 'Request is deprecated', declared: '^2.0.0', latest: '3.0.0', minVersion: '2.0.0' }),
    ];
    const findings = buildDepFindings(results);
    expect(findings.find((f) => f.id === 'deprecated-deps')).toBeDefined();
    expect(findings.find((f) => f.id === 'outdated-majors')).toBeDefined();
    expect(findings).toHaveLength(2);
  });

  it('finding titles mention the count', () => {
    const results = [
      makeResult({ name: 'pkg1', deprecated: 'deprecated' }),
      makeResult({ name: 'pkg2', deprecated: 'also deprecated' }),
    ];
    const findings = buildDepFindings(results);
    const dep = findings.find((f) => f.id === 'deprecated-deps');
    expect(dep?.title).toContain('2');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('buildDepFindings – property tests', () => {
  const depResultArb: fc.Arbitrary<DepResult> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    declared: fc.constantFrom('^1.0.0', '^2.0.0', '~3.0.0', '>=4.0.0'),
    deprecated: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    latest: fc.option(
      fc.tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
        .map(([maj, min, pat]) => `${maj}.${min}.${pat}`),
      { nil: null },
    ),
    minVersion: fc.option(
      fc.tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
        .map(([maj, min, pat]) => `${maj}.${min}.${pat}`),
      { nil: null },
    ),
  });

  /** Output length is always 0, 1, or 2. */
  it('returns at most 2 findings', () => {
    fc.assert(
      fc.property(fc.array(depResultArb), (results) => {
        return buildDepFindings(results).length <= 2;
      }),
    );
  });

  /** Finding IDs are always from the allowed set. */
  it('every finding id is "deprecated-deps" or "outdated-majors"', () => {
    fc.assert(
      fc.property(fc.array(depResultArb), (results) => {
        return buildDepFindings(results).every(
          (f) => f.id === 'deprecated-deps' || f.id === 'outdated-majors',
        );
      }),
    );
  });

  /** deprecated-deps is only produced when at least one dep is non-null non-empty deprecated. */
  it('produces deprecated-deps only when there is at least one deprecation message', () => {
    fc.assert(
      fc.property(fc.array(depResultArb), (results) => {
        const findings = buildDepFindings(results);
        const hasDeprecated = findings.some((f) => f.id === 'deprecated-deps');
        const anyActuallyDeprecated = results.some(
          (r) => r.deprecated !== null && r.deprecated.trim() !== '',
        );
        return !hasDeprecated || anyActuallyDeprecated;
      }),
    );
  });

  /** outdated-majors is only produced when at least one major lag exists. */
  it('produces outdated-majors only when at least one dep is behind a major', () => {
    fc.assert(
      fc.property(fc.array(depResultArb), (results) => {
        const findings = buildDepFindings(results);
        const hasOutdated = findings.some((f) => f.id === 'outdated-majors');
        const anyOutdated = results.some((r) => {
          if (r.latest === null || r.minVersion === null) return false;
          const latestMajor = parseInt(r.latest.split('.')[0] ?? '0', 10);
          const minMajor = parseInt(r.minVersion.split('.')[0] ?? '0', 10);
          return !isNaN(latestMajor) && !isNaN(minMajor) && latestMajor > minMajor;
        });
        return !hasOutdated || anyOutdated;
      }),
    );
  });

  /** Evidence for deprecated-deps never exceeds 200 characters. */
  it('deprecated-deps evidence is always ≤ 200 chars', () => {
    fc.assert(
      fc.property(fc.array(depResultArb, { minLength: 1 }), (results) => {
        return buildDepFindings(results).every(
          (f) => f.id !== 'deprecated-deps' || f.evidence.length <= 200,
        );
      }),
    );
  });

  /** Every finding has non-empty required string fields. */
  it('every finding has non-empty id, title, evidence, fixHint', () => {
    fc.assert(
      fc.property(fc.array(depResultArb), (results) => {
        return buildDepFindings(results).every(
          (f) =>
            f.id.length > 0 &&
            f.title.length > 0 &&
            f.evidence.length > 0 &&
            f.fixHint.length > 0,
        );
      }),
    );
  });
});
