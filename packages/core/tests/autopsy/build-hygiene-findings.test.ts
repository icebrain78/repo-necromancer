import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildHygieneFindings,
  type HygieneSignals,
} from '../../src/autopsy/build-hygiene-findings.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function signals(overrides: Partial<HygieneSignals> = {}): HygieneSignals {
  return {
    hasLockfile: true,
    hasTestScript: true,
    hasTravisCi: false,
    hasGithubWorkflows: true,
    archived: false,
    ...overrides,
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('buildHygieneFindings – unit tests', () => {
  it('returns [] when all signals are healthy', () => {
    expect(buildHygieneFindings(signals())).toEqual([]);
  });

  // archived-repo
  it('produces "archived-repo" (fatal) when archived is true', () => {
    const findings = buildHygieneFindings(signals({ archived: true }));
    const f = findings.find((x) => x.id === 'archived-repo');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('fatal');
    expect(f?.category).toBe('hygiene');
  });

  it('does not produce "archived-repo" when archived is false', () => {
    const findings = buildHygieneFindings(signals({ archived: false }));
    expect(findings.find((x) => x.id === 'archived-repo')).toBeUndefined();
  });

  // missing-lockfile
  it('produces "missing-lockfile" (serious) when hasLockfile is false', () => {
    const findings = buildHygieneFindings(signals({ hasLockfile: false }));
    const f = findings.find((x) => x.id === 'missing-lockfile');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('serious');
    expect(f?.category).toBe('hygiene');
  });

  it('does not produce "missing-lockfile" when hasLockfile is true', () => {
    const findings = buildHygieneFindings(signals({ hasLockfile: true }));
    expect(findings.find((x) => x.id === 'missing-lockfile')).toBeUndefined();
  });

  // missing-test-script
  it('produces "missing-test-script" (minor) when hasTestScript is false', () => {
    const findings = buildHygieneFindings(signals({ hasTestScript: false }));
    const f = findings.find((x) => x.id === 'missing-test-script');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('minor');
    expect(f?.category).toBe('hygiene');
  });

  it('does not produce "missing-test-script" when hasTestScript is true', () => {
    const findings = buildHygieneFindings(signals({ hasTestScript: true }));
    expect(findings.find((x) => x.id === 'missing-test-script')).toBeUndefined();
  });

  // dead-ci
  it('produces "dead-ci" (minor) when hasTravisCi is true and hasGithubWorkflows is false', () => {
    const findings = buildHygieneFindings(
      signals({ hasTravisCi: true, hasGithubWorkflows: false }),
    );
    const f = findings.find((x) => x.id === 'dead-ci');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('minor');
    expect(f?.category).toBe('hygiene');
  });

  it('does not produce "dead-ci" when hasTravisCi is false', () => {
    const findings = buildHygieneFindings(
      signals({ hasTravisCi: false, hasGithubWorkflows: false }),
    );
    expect(findings.find((x) => x.id === 'dead-ci')).toBeUndefined();
  });

  it('does not produce "dead-ci" when hasTravisCi is true but hasGithubWorkflows is also true', () => {
    const findings = buildHygieneFindings(
      signals({ hasTravisCi: true, hasGithubWorkflows: true }),
    );
    expect(findings.find((x) => x.id === 'dead-ci')).toBeUndefined();
  });

  // Multiple findings at once
  it('returns all four findings when all signals are bad', () => {
    const findings = buildHygieneFindings({
      hasLockfile: false,
      hasTestScript: false,
      hasTravisCi: true,
      hasGithubWorkflows: false,
      archived: true,
    });
    expect(findings.map((f) => f.id).sort()).toEqual(
      ['archived-repo', 'dead-ci', 'missing-lockfile', 'missing-test-script'].sort(),
    );
  });

  it('order: archived-repo comes before missing-lockfile', () => {
    const findings = buildHygieneFindings({
      hasLockfile: false,
      hasTestScript: true,
      hasTravisCi: false,
      hasGithubWorkflows: false,
      archived: true,
    });
    const ids = findings.map((f) => f.id);
    expect(ids.indexOf('archived-repo')).toBeLessThan(ids.indexOf('missing-lockfile'));
  });

  // Evidence / fixHint sanity
  it('every finding has non-empty title, evidence, and fixHint', () => {
    const findings = buildHygieneFindings({
      hasLockfile: false,
      hasTestScript: false,
      hasTravisCi: true,
      hasGithubWorkflows: false,
      archived: true,
    });
    for (const f of findings) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.fixHint.length).toBeGreaterThan(0);
    }
  });

  it('archived-repo evidence mentions "archived"', () => {
    const findings = buildHygieneFindings(signals({ archived: true }));
    const f = findings.find((x) => x.id === 'archived-repo');
    expect(f?.evidence.toLowerCase()).toContain('archived');
  });

  it('missing-lockfile evidence mentions lockfile types', () => {
    const findings = buildHygieneFindings(signals({ hasLockfile: false }));
    const f = findings.find((x) => x.id === 'missing-lockfile');
    expect(f?.evidence).toContain('package-lock.json');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('buildHygieneFindings – property tests', () => {
  const signalsArb: fc.Arbitrary<HygieneSignals> = fc.record({
    hasLockfile: fc.boolean(),
    hasTestScript: fc.boolean(),
    hasTravisCi: fc.boolean(),
    hasGithubWorkflows: fc.boolean(),
    archived: fc.boolean(),
  });

  /** Output length is always between 0 and 4. */
  it('returns 0–4 findings', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const len = buildHygieneFindings(s).length;
        return len >= 0 && len <= 4;
      }),
    );
  });

  /** Every returned finding has category "hygiene". */
  it('every finding has category "hygiene"', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        return buildHygieneFindings(s).every((f) => f.category === 'hygiene');
      }),
    );
  });

  /** Every finding id is from the known set. */
  it('finding ids are from the known set', () => {
    const knownIds = new Set([
      'archived-repo',
      'missing-lockfile',
      'missing-test-script',
      'dead-ci',
    ]);
    fc.assert(
      fc.property(signalsArb, (s) => {
        return buildHygieneFindings(s).every((f) => knownIds.has(f.id));
      }),
    );
  });

  /** No duplicate IDs in a single run. */
  it('no duplicate IDs in output', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const ids = buildHygieneFindings(s).map((f) => f.id);
        return ids.length === new Set(ids).size;
      }),
    );
  });

  /** archived-repo is present iff archived is true. */
  it('"archived-repo" is present iff archived is true', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const hasArchivedFinding = buildHygieneFindings(s).some(
          (f) => f.id === 'archived-repo',
        );
        return hasArchivedFinding === s.archived;
      }),
    );
  });

  /** missing-lockfile is present iff hasLockfile is false. */
  it('"missing-lockfile" is present iff hasLockfile is false', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const hasFinding = buildHygieneFindings(s).some(
          (f) => f.id === 'missing-lockfile',
        );
        return hasFinding === !s.hasLockfile;
      }),
    );
  });

  /** missing-test-script is present iff hasTestScript is false. */
  it('"missing-test-script" is present iff hasTestScript is false', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const hasFinding = buildHygieneFindings(s).some(
          (f) => f.id === 'missing-test-script',
        );
        return hasFinding === !s.hasTestScript;
      }),
    );
  });

  /** dead-ci is present iff hasTravisCi is true AND hasGithubWorkflows is false. */
  it('"dead-ci" is present iff hasTravisCi && !hasGithubWorkflows', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        const hasFinding = buildHygieneFindings(s).some((f) => f.id === 'dead-ci');
        return hasFinding === (s.hasTravisCi && !s.hasGithubWorkflows);
      }),
    );
  });

  /** Severity of archived-repo is always "fatal". */
  it('"archived-repo" severity is always fatal', () => {
    fc.assert(
      fc.property(signalsArb.filter((s) => s.archived), (s) => {
        const f = buildHygieneFindings(s).find((x) => x.id === 'archived-repo');
        return f?.severity === 'fatal';
      }),
    );
  });

  /** Severity of missing-lockfile is always "serious". */
  it('"missing-lockfile" severity is always serious', () => {
    fc.assert(
      fc.property(signalsArb.filter((s) => !s.hasLockfile), (s) => {
        const f = buildHygieneFindings(s).find((x) => x.id === 'missing-lockfile');
        return f?.severity === 'serious';
      }),
    );
  });

  /** Severity of missing-test-script and dead-ci are always "minor". */
  it('"missing-test-script" and "dead-ci" severities are always minor', () => {
    fc.assert(
      fc.property(signalsArb, (s) => {
        return buildHygieneFindings(s)
          .filter((f) => f.id === 'missing-test-script' || f.id === 'dead-ci')
          .every((f) => f.severity === 'minor');
      }),
    );
  });
});
