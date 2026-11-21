import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveMinVersion } from '../../src/autopsy/resolve-min-version.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check that a string looks like a dotted-numeric version (e.g. "1.2.3"). */
function isDottedNumeric(s: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(s);
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('resolveMinVersion – unit tests', () => {
  // Wildcard / unparseable → null
  it('returns null for "*"', () => {
    expect(resolveMinVersion('*')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveMinVersion('')).toBeNull();
  });

  it('returns null for "latest"', () => {
    expect(resolveMinVersion('latest')).toBeNull();
  });

  it('returns null for "next"', () => {
    expect(resolveMinVersion('next')).toBeNull();
  });

  it('returns null for "beta"', () => {
    expect(resolveMinVersion('beta')).toBeNull();
  });

  // Exact versions
  it('handles "1.2.3" (no operator)', () => {
    expect(resolveMinVersion('1.2.3')).toBe('1.2.3');
  });

  it('handles "v1.2.3" (v-prefix)', () => {
    expect(resolveMinVersion('v1.2.3')).toBe('1.2.3');
  });

  it('handles "V14.17.0" (uppercase V)', () => {
    expect(resolveMinVersion('V14.17.0')).toBe('14.17.0');
  });

  // Caret / tilde
  it('handles "^1.2.3"', () => {
    expect(resolveMinVersion('^1.2.3')).toBe('1.2.3');
  });

  it('handles "~2.3.4"', () => {
    expect(resolveMinVersion('~2.3.4')).toBe('2.3.4');
  });

  it('handles "^14" (major only)', () => {
    expect(resolveMinVersion('^14')).toBe('14.0.0');
  });

  it('handles "~12.0" (major.minor only)', () => {
    expect(resolveMinVersion('~12.0')).toBe('12.0.0');
  });

  // Comparison operators
  it('handles ">=16.0.0"', () => {
    expect(resolveMinVersion('>=16.0.0')).toBe('16.0.0');
  });

  it('handles ">=16" (major only)', () => {
    expect(resolveMinVersion('>=16')).toBe('16.0.0');
  });

  it('handles ">8"', () => {
    expect(resolveMinVersion('>8')).toBe('8.0.0');
  });

  it('handles "<=20.0.0"', () => {
    expect(resolveMinVersion('<=20.0.0')).toBe('20.0.0');
  });

  it('handles "<3.0.0"', () => {
    expect(resolveMinVersion('<3.0.0')).toBe('3.0.0');
  });

  it('handles "=1.0.0"', () => {
    expect(resolveMinVersion('=1.0.0')).toBe('1.0.0');
  });

  // Compound range: take the lower bound (first token)
  it('extracts lower bound from compound range ">=16.0.0 <18"', () => {
    expect(resolveMinVersion('>=16.0.0 <18')).toBe('16.0.0');
  });

  it('extracts lower bound from "^1.2.3 || ^2.0.0"', () => {
    // First token is "^1.2.3"
    expect(resolveMinVersion('^1.2.3 || ^2.0.0')).toBe('1.2.3');
  });

  // Missing parts filled with 0
  it('fills missing minor and patch with 0 for major-only "5"', () => {
    expect(resolveMinVersion('5')).toBe('5.0.0');
  });

  it('fills missing patch with 0 for "3.4"', () => {
    expect(resolveMinVersion('3.4')).toBe('3.4.0');
  });

  // Whitespace
  it('trims surrounding whitespace', () => {
    expect(resolveMinVersion('  ^2.0.0  ')).toBe('2.0.0');
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('resolveMinVersion – property tests', () => {
  /**
   * The result is always either null or a dotted-numeric "major.minor.patch"
   * string regardless of the input.
   */
  it('always returns null or a "major.minor.patch" string', () => {
    fc.assert(
      fc.property(fc.string(), (range) => {
        const result = resolveMinVersion(range);
        return result === null || isDottedNumeric(result);
      }),
    );
  });

  /**
   * For exact "major.minor.patch" version strings (no operator), the output
   * equals the input (after stripping a leading v/V).
   */
  it('returns input unchanged for exact "M.m.p" strings', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (major, minor, patch) => {
          const ver = `${major}.${minor}.${patch}`;
          return resolveMinVersion(ver) === ver;
        },
      ),
    );
  });

  /**
   * For "^M.m.p", "~M.m.p", ">=M.m.p", ">M.m.p", "<=M.m.p", "<M.m.p" the
   * result equals "M.m.p".
   */
  it('strips all single-operator prefixes from full semver strings', () => {
    const operators = ['^', '~', '>=', '>', '<=', '<', '='] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...operators),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (op, major, minor, patch) => {
          const range = `${op}${major}.${minor}.${patch}`;
          const expected = `${major}.${minor}.${patch}`;
          return resolveMinVersion(range) === expected;
        },
      ),
    );
  });

  /**
   * Major-only integers (no operator, no dot) produce "N.0.0".
   */
  it('fills missing minor and patch with 0 for plain integers', () => {
    fc.assert(
      fc.property(fc.nat({ max: 99 }), (major) => {
        return resolveMinVersion(String(major)) === `${major}.0.0`;
      }),
    );
  });

  /**
   * "^N" (caret + major only) produces "N.0.0".
   */
  it('caret-prefixed major-only integers produce "N.0.0"', () => {
    fc.assert(
      fc.property(fc.nat({ max: 99 }), (major) => {
        return resolveMinVersion(`^${major}`) === `${major}.0.0`;
      }),
    );
  });

  /**
   * "v"-prefixed full semver strings return the same version without the "v".
   */
  it('strips leading "v" from vM.m.p strings', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (major, minor, patch) => {
          const ver = `v${major}.${minor}.${patch}`;
          return resolveMinVersion(ver) === `${major}.${minor}.${patch}`;
        },
      ),
    );
  });

  /**
   * Strings that contain no digit at all always return null.
   */
  it('returns null for strings with no digits', () => {
    fc.assert(
      fc.property(
        // Generate strings from a set that never contains digits
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_.*^~<>='.split('')), {
          minLength: 1,
          maxLength: 20,
        }),
        (s) => {
          // Filter out strings that happen to have digits (they won't from this alphabet)
          return resolveMinVersion(s) === null;
        },
      ),
    );
  });
});
