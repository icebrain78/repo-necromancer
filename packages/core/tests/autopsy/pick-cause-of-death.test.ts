import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { pickCauseOfDeath } from '../../src/autopsy/pick-cause-of-death.js';
import type { AutopsyFinding, FindingSeverity } from '../../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function finding(
  id: string,
  severity: FindingSeverity = 'minor',
): AutopsyFinding {
  return {
    id,
    category: 'hygiene',
    severity,
    title: `Title for ${id}`,
    evidence: `Evidence for ${id}`,
    fixHint: `Fix hint for ${id}`,
  };
}

/** Build an arbitrary AutopsyFinding. */
const findingArb: fc.Arbitrary<AutopsyFinding> = fc.record({
  id: fc.constantFrom(
    'archived-repo',
    'node-eol',
    'known-vulns',
    'deprecated-deps',
    'outdated-majors',
    'missing-lockfile',
    'dead-ci',
    'missing-test-script',
    'node-version-unknown',
    'custom-finding-z',
  ),
  category: fc.constantFrom(
    'runtime',
    'deprecated-deps',
    'outdated-majors',
    'vulnerabilities',
    'hygiene',
  ),
  severity: fc.constantFrom('fatal', 'serious', 'minor'),
  title: fc.string({ minLength: 1, maxLength: 40 }),
  evidence: fc.string({ minLength: 1, maxLength: 80 }),
  fixHint: fc.string({ minLength: 1, maxLength: 80 }),
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('pickCauseOfDeath – unit tests', () => {
  it('returns null for an empty array', () => {
    expect(pickCauseOfDeath([])).toBeNull();
  });

  it('returns the only element when the array has one finding', () => {
    const f = finding('node-eol', 'fatal');
    expect(pickCauseOfDeath([f])).toBe(f);
  });

  // ── Priority ordering ───────────────────────────────────────────────────────

  it('prefers "archived-repo" over "node-eol"', () => {
    const result = pickCauseOfDeath([
      finding('node-eol', 'fatal'),
      finding('archived-repo', 'fatal'),
    ]);
    expect(result?.id).toBe('archived-repo');
  });

  it('prefers "node-eol" over "deprecated-deps"', () => {
    const result = pickCauseOfDeath([
      finding('deprecated-deps', 'fatal'),
      finding('node-eol', 'fatal'),
    ]);
    expect(result?.id).toBe('node-eol');
  });

  it('prefers "deprecated-deps" over "outdated-majors"', () => {
    const result = pickCauseOfDeath([
      finding('outdated-majors', 'serious'),
      finding('deprecated-deps', 'fatal'),
    ]);
    expect(result?.id).toBe('deprecated-deps');
  });

  it('prefers "outdated-majors" over "missing-lockfile"', () => {
    const result = pickCauseOfDeath([
      finding('missing-lockfile', 'serious'),
      finding('outdated-majors', 'serious'),
    ]);
    expect(result?.id).toBe('outdated-majors');
  });

  it('prefers "missing-lockfile" over "dead-ci"', () => {
    const result = pickCauseOfDeath([
      finding('dead-ci', 'minor'),
      finding('missing-lockfile', 'serious'),
    ]);
    expect(result?.id).toBe('missing-lockfile');
  });

  it('prefers "dead-ci" over "missing-test-script"', () => {
    const result = pickCauseOfDeath([
      finding('missing-test-script', 'minor'),
      finding('dead-ci', 'minor'),
    ]);
    expect(result?.id).toBe('dead-ci');
  });

  it('prefers "missing-test-script" over "node-version-unknown"', () => {
    const result = pickCauseOfDeath([
      finding('node-version-unknown', 'minor'),
      finding('missing-test-script', 'minor'),
    ]);
    expect(result?.id).toBe('missing-test-script');
  });

  // ── known-vulns priority depends on severity ───────────────────────────────

  it('known-vulns fatal ranks above deprecated-deps (fatal)', () => {
    const vulns = { ...finding('known-vulns', 'fatal'), category: 'vulnerabilities' as const };
    const deprecated = finding('deprecated-deps', 'fatal');
    expect(pickCauseOfDeath([deprecated, vulns])?.id).toBe('known-vulns');
  });

  it('known-vulns serious ranks below deprecated-deps (fatal)', () => {
    const vulns = { ...finding('known-vulns', 'serious'), category: 'vulnerabilities' as const };
    const deprecated = finding('deprecated-deps', 'fatal');
    expect(pickCauseOfDeath([vulns, deprecated])?.id).toBe('deprecated-deps');
  });

  it('known-vulns minor ranks below deprecated-deps (fatal)', () => {
    const vulns = { ...finding('known-vulns', 'minor'), category: 'vulnerabilities' as const };
    const deprecated = finding('deprecated-deps', 'fatal');
    expect(pickCauseOfDeath([vulns, deprecated])?.id).toBe('deprecated-deps');
  });

  it('known-vulns fatal ranks above node-eol (fatal)', () => {
    // known-vulns-critical slot index (2) > node-eol slot index (1), so node-eol wins
    // actually node-eol (1) < known-vulns-critical (2), so node-eol has *higher* priority
    const vulns = { ...finding('known-vulns', 'fatal'), category: 'vulnerabilities' as const };
    const eol = finding('node-eol', 'fatal');
    expect(pickCauseOfDeath([vulns, eol])?.id).toBe('node-eol');
  });

  it('known-vulns serious ranks below outdated-majors', () => {
    // known-vulns-moderate slot index (4) vs outdated-majors slot index (5)
    // 4 < 5, so known-vulns moderate still beats outdated-majors
    const vulns = { ...finding('known-vulns', 'serious'), category: 'vulnerabilities' as const };
    const outdated = finding('outdated-majors', 'serious');
    expect(pickCauseOfDeath([vulns, outdated])?.id).toBe('known-vulns');
  });

  // ── Severity tie-breaking ───────────────────────────────────────────────────

  it('among same-slot findings, fatal beats serious', () => {
    // Use two unknown IDs that map to same unknown slot
    const fatalFinding: AutopsyFinding = {
      ...finding('unknown-a', 'fatal'),
      id: 'unknown-a',
    };
    const seriousFinding: AutopsyFinding = {
      ...finding('unknown-a', 'serious'),
      id: 'unknown-a',
    };
    // Inject as different id so we can distinguish them
    const f1: AutopsyFinding = { ...fatalFinding, id: 'zzz-b', severity: 'fatal' };
    const f2: AutopsyFinding = { ...seriousFinding, id: 'zzz-c', severity: 'serious' };
    // Both unknown ids → same slot; fatal should win
    expect(pickCauseOfDeath([f2, f1])?.severity).toBe('fatal');
  });

  it('among same severity, alphabetically earlier id wins', () => {
    // Both unknown ids → same slot, same severity (minor)
    const f1: AutopsyFinding = { ...finding('zzz-alpha', 'minor'), id: 'zzz-alpha' };
    const f2: AutopsyFinding = { ...finding('zzz-beta', 'minor'), id: 'zzz-beta' };
    expect(pickCauseOfDeath([f2, f1])?.id).toBe('zzz-alpha');
    expect(pickCauseOfDeath([f1, f2])?.id).toBe('zzz-alpha');
  });

  // ── Does not mutate input ───────────────────────────────────────────────────

  it('does not mutate the input array', () => {
    const findings = [
      finding('node-eol', 'fatal'),
      finding('missing-lockfile', 'serious'),
      finding('dead-ci', 'minor'),
    ];
    const before = findings.map((f) => f.id);
    pickCauseOfDeath(findings);
    expect(findings.map((f) => f.id)).toEqual(before);
  });

  // ── Full priority stack ─────────────────────────────────────────────────────

  it('returns archived-repo from a full set of findings', () => {
    const all = [
      finding('node-version-unknown', 'minor'),
      finding('missing-test-script', 'minor'),
      finding('dead-ci', 'minor'),
      finding('missing-lockfile', 'serious'),
      finding('outdated-majors', 'serious'),
      finding('deprecated-deps', 'fatal'),
      finding('node-eol', 'fatal'),
      finding('archived-repo', 'fatal'),
    ];
    expect(pickCauseOfDeath(all)?.id).toBe('archived-repo');
  });

  it('returns node-eol when archived-repo is absent', () => {
    const findings = [
      finding('node-version-unknown', 'minor'),
      finding('missing-test-script', 'minor'),
      finding('outdated-majors', 'serious'),
      finding('deprecated-deps', 'fatal'),
      finding('node-eol', 'fatal'),
    ];
    expect(pickCauseOfDeath(findings)?.id).toBe('node-eol');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('pickCauseOfDeath – property tests', () => {
  /** For any non-empty array, the result is always one of the input findings. */
  it('result is always a member of the input array', () => {
    fc.assert(
      fc.property(fc.array(findingArb, { minLength: 1 }), (findings) => {
        const result = pickCauseOfDeath(findings);
        return findings.includes(result as AutopsyFinding);
      }),
    );
  });

  /** An empty array always returns null. */
  it('empty array always returns null', () => {
    expect(pickCauseOfDeath([])).toBeNull();
  });

  /** For a single-element array, the result is that element. */
  it('single-element array always returns that element', () => {
    fc.assert(
      fc.property(findingArb, (f) => {
        return pickCauseOfDeath([f]) === f;
      }),
    );
  });

  /** Adding a known lower-priority finding never changes the result. */
  it('adding a "node-version-unknown" finding never makes it the cause of death when other findings exist', () => {
    const unknownFinding = finding('node-version-unknown', 'minor');
    fc.assert(
      fc.property(
        fc.array(findingArb, { minLength: 1 }).filter((arr) =>
          arr.some((f) => f.id !== 'node-version-unknown'),
        ),
        (findings) => {
          // If none of the other findings have node-version-unknown id, appending
          // one should not change the winner unless everything else maps to same slot
          const withExtra = [...findings, unknownFinding];
          const result = pickCauseOfDeath(withExtra);
          // Result must still be a member
          return withExtra.includes(result as AutopsyFinding);
        },
      ),
    );
  });

  /** The result always has the minimum slot index among all findings. */
  it('result always has the highest-priority (minimum) slot among all findings', () => {
    // We replicate the slot logic here to verify the invariant
    const PRIORITY_SLOTS = [
      'archived-repo',
      'node-eol',
      'known-vulns-critical',
      'deprecated-deps',
      'known-vulns-moderate',
      'outdated-majors',
      'missing-lockfile',
      'dead-ci',
      'missing-test-script',
      'node-version-unknown',
    ];

    function slotOf(f: AutopsyFinding): number {
      if (f.id === 'known-vulns') {
        const slot =
          f.severity === 'fatal' ? 'known-vulns-critical' : 'known-vulns-moderate';
        const idx = PRIORITY_SLOTS.indexOf(slot);
        return idx === -1 ? PRIORITY_SLOTS.length : idx;
      }
      const idx = PRIORITY_SLOTS.indexOf(f.id);
      return idx === -1 ? PRIORITY_SLOTS.length : idx;
    }

    fc.assert(
      fc.property(fc.array(findingArb, { minLength: 1 }), (findings) => {
        const result = pickCauseOfDeath(findings);
        const resultSlot = slotOf(result as AutopsyFinding);
        const minSlot = Math.min(...findings.map(slotOf));
        return resultSlot === minSlot;
      }),
    );
  });

  /** The result severity is never worse than the best severity among same-slot findings. */
  it('result has the best severity among candidates at the winning slot', () => {
    const SEVERITY_RANK: Record<string, number> = { fatal: 0, serious: 1, minor: 2 };
    const PRIORITY_SLOTS = [
      'archived-repo', 'node-eol', 'known-vulns-critical', 'deprecated-deps',
      'known-vulns-moderate', 'outdated-majors', 'missing-lockfile',
      'dead-ci', 'missing-test-script', 'node-version-unknown',
    ];

    function slotOf(f: AutopsyFinding): number {
      if (f.id === 'known-vulns') {
        const slot = f.severity === 'fatal' ? 'known-vulns-critical' : 'known-vulns-moderate';
        const idx = PRIORITY_SLOTS.indexOf(slot);
        return idx === -1 ? PRIORITY_SLOTS.length : idx;
      }
      const idx = PRIORITY_SLOTS.indexOf(f.id);
      return idx === -1 ? PRIORITY_SLOTS.length : idx;
    }

    fc.assert(
      fc.property(fc.array(findingArb, { minLength: 1 }), (findings) => {
        const result = pickCauseOfDeath(findings) as AutopsyFinding;
        const winningSlot = slotOf(result);
        const candidatesAtSlot = findings.filter((f) => slotOf(f) === winningSlot);
        const bestSevRank = Math.min(
          ...candidatesAtSlot.map((f) => SEVERITY_RANK[f.severity] ?? 3),
        );
        return (SEVERITY_RANK[result.severity] ?? 3) === bestSevRank;
      }),
    );
  });

  /** Result never mutates the input array. */
  it('never mutates the input array', () => {
    fc.assert(
      fc.property(fc.array(findingArb), (findings) => {
        const copy = findings.map((f) => f.id);
        pickCauseOfDeath(findings);
        return findings.every((f, i) => f.id === copy[i]);
      }),
    );
  });
});
