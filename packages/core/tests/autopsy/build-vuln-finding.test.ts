import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildVulnFinding,
  type OsvVulnSummary,
} from '../../src/autopsy/build-vuln-finding.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function summary(overrides: Partial<OsvVulnSummary> = {}): OsvVulnSummary {
  return {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    affectedPackages: 0,
    ...overrides,
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('buildVulnFinding – unit tests', () => {
  it('returns null when all counts are zero', () => {
    expect(buildVulnFinding(summary())).toBeNull();
  });

  it('returns "fatal" when critical > 0', () => {
    const f = buildVulnFinding(summary({ critical: 2, affectedPackages: 1 }));
    expect(f?.severity).toBe('fatal');
  });

  it('returns "fatal" when high > 0 and critical = 0', () => {
    const f = buildVulnFinding(summary({ high: 3, affectedPackages: 2 }));
    expect(f?.severity).toBe('fatal');
  });

  it('returns "fatal" when both critical and high > 0', () => {
    const f = buildVulnFinding(summary({ critical: 1, high: 1, affectedPackages: 1 }));
    expect(f?.severity).toBe('fatal');
  });

  it('returns "serious" when moderate > 0 and no critical/high', () => {
    const f = buildVulnFinding(summary({ moderate: 5, affectedPackages: 3 }));
    expect(f?.severity).toBe('serious');
  });

  it('returns "minor" when only low > 0', () => {
    const f = buildVulnFinding(summary({ low: 7, affectedPackages: 4 }));
    expect(f?.severity).toBe('minor');
  });

  it('id is always "known-vulns"', () => {
    const f = buildVulnFinding(summary({ critical: 1, affectedPackages: 1 }));
    expect(f?.id).toBe('known-vulns');
  });

  it('category is always "vulnerabilities"', () => {
    const f = buildVulnFinding(summary({ high: 1, affectedPackages: 1 }));
    expect(f?.category).toBe('vulnerabilities');
  });

  it('evidence contains CRITICAL count when critical > 0', () => {
    const f = buildVulnFinding(summary({ critical: 3, affectedPackages: 2 }));
    expect(f?.evidence).toContain('3 CRITICAL');
  });

  it('evidence contains HIGH count when high > 0', () => {
    const f = buildVulnFinding(summary({ high: 2, affectedPackages: 1 }));
    expect(f?.evidence).toContain('2 HIGH');
  });

  it('evidence contains MODERATE count when moderate > 0', () => {
    const f = buildVulnFinding(summary({ moderate: 4, affectedPackages: 2 }));
    expect(f?.evidence).toContain('4 MODERATE');
  });

  it('evidence contains LOW count when low > 0', () => {
    const f = buildVulnFinding(summary({ low: 1, affectedPackages: 1 }));
    expect(f?.evidence).toContain('1 LOW');
  });

  it('evidence omits zero-count severities', () => {
    const f = buildVulnFinding(summary({ critical: 2, affectedPackages: 1 }));
    expect(f?.evidence).not.toContain('HIGH');
    expect(f?.evidence).not.toContain('MODERATE');
    expect(f?.evidence).not.toContain('LOW');
  });

  it('evidence contains the affectedPackages count', () => {
    const f = buildVulnFinding(summary({ high: 1, affectedPackages: 5 }));
    expect(f?.evidence).toContain('5');
  });

  it('evidence uses singular "package" for affectedPackages = 1', () => {
    const f = buildVulnFinding(summary({ low: 1, affectedPackages: 1 }));
    expect(f?.evidence).toContain('1 package');
    expect(f?.evidence).not.toContain('1 packages');
  });

  it('evidence uses plural "packages" for affectedPackages > 1', () => {
    const f = buildVulnFinding(summary({ low: 2, affectedPackages: 2 }));
    expect(f?.evidence).toContain('2 packages');
  });

  it('fixHint is non-empty', () => {
    const f = buildVulnFinding(summary({ critical: 1, affectedPackages: 1 }));
    expect(f?.fixHint.length).toBeGreaterThan(0);
  });

  it('title contains the total vulnerability count', () => {
    const f = buildVulnFinding(summary({ critical: 2, high: 3, affectedPackages: 2 }));
    expect(f?.title).toContain('5');
  });

  it('title uses singular "vulnerability" for total = 1', () => {
    const f = buildVulnFinding(summary({ critical: 1, affectedPackages: 1 }));
    expect(f?.title).toMatch(/1 known vulnerability/);
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('buildVulnFinding – property tests', () => {
  const countArb = fc.nat({ max: 50 });
  const summaryArb: fc.Arbitrary<OsvVulnSummary> = fc.record({
    critical: countArb,
    high: countArb,
    moderate: countArb,
    low: countArb,
    affectedPackages: fc.nat({ max: 50 }),
  });

  /** Returns null iff total is 0. */
  it('returns null iff total count is 0', () => {
    fc.assert(
      fc.property(summaryArb, (s) => {
        const result = buildVulnFinding(s);
        const total = s.critical + s.high + s.moderate + s.low;
        return (result === null) === (total === 0);
      }),
    );
  });

  /** When critical + high > 0, severity is fatal. */
  it('severity is fatal when critical + high > 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          critical: fc.nat({ max: 50 }),
          high: fc.nat({ max: 50 }),
          moderate: fc.nat({ max: 50 }),
          low: fc.nat({ max: 50 }),
          affectedPackages: fc.nat({ max: 50 }),
        }).filter((s) => s.critical + s.high > 0),
        (s) => {
          return buildVulnFinding(s)?.severity === 'fatal';
        },
      ),
    );
  });

  /** When critical = high = 0 and moderate > 0, severity is serious. */
  it('severity is serious when only moderate > 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          critical: fc.constant(0),
          high: fc.constant(0),
          moderate: fc.integer({ min: 1, max: 50 }),
          low: fc.nat({ max: 50 }),
          affectedPackages: fc.integer({ min: 1, max: 50 }),
        }),
        (s) => {
          return buildVulnFinding(s)?.severity === 'serious';
        },
      ),
    );
  });

  /** When only low > 0, severity is minor. */
  it('severity is minor when only low > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (low, affected) => {
          const s = summary({ low, affectedPackages: affected });
          return buildVulnFinding(s)?.severity === 'minor';
        },
      ),
    );
  });

  /** id is always "known-vulns" for non-null results. */
  it('id is always "known-vulns"', () => {
    fc.assert(
      fc.property(summaryArb, (s) => {
        const result = buildVulnFinding(s);
        return result === null || result.id === 'known-vulns';
      }),
    );
  });

  /** Evidence never contains a "0 CRITICAL" label. */
  it('zero-count severities never appear in evidence', () => {
    fc.assert(
      fc.property(summaryArb, (s) => {
        const f = buildVulnFinding(s);
        if (f === null) return true;
        if (s.critical === 0 && f.evidence.includes('CRITICAL')) return false;
        if (s.high === 0 && f.evidence.includes('HIGH')) return false;
        if (s.moderate === 0 && f.evidence.includes('MODERATE')) return false;
        if (s.low === 0 && f.evidence.includes('LOW')) return false;
        return true;
      }),
    );
  });
});
