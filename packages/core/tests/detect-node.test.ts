import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isNodeRepo } from '../src/detect-node.js';

// ── Unit tests ───────────────────────────────────────────────────────────────

describe('isNodeRepo – language triggers', () => {
  it('returns true when language is JavaScript (no package.json)', () => {
    expect(isNodeRepo('JavaScript', false)).toBe(true);
  });

  it('returns true when language is JavaScript (with package.json)', () => {
    expect(isNodeRepo('JavaScript', true)).toBe(true);
  });

  it('returns true when language is TypeScript (no package.json)', () => {
    expect(isNodeRepo('TypeScript', false)).toBe(true);
  });

  it('returns true when language is TypeScript (with package.json)', () => {
    expect(isNodeRepo('TypeScript', true)).toBe(true);
  });
});

describe('isNodeRepo – package.json trigger', () => {
  it('returns true when language is null but package.json is present', () => {
    expect(isNodeRepo(null, true)).toBe(true);
  });

  it('returns true when language is some other language but package.json is present', () => {
    expect(isNodeRepo('Python', true)).toBe(true);
  });

  it('returns true when language is Ruby but package.json is present', () => {
    expect(isNodeRepo('Ruby', true)).toBe(true);
  });
});

describe('isNodeRepo – non-Node cases', () => {
  it('returns false when language is null and no package.json', () => {
    expect(isNodeRepo(null, false)).toBe(false);
  });

  it('returns false when language is Python and no package.json', () => {
    expect(isNodeRepo('Python', false)).toBe(false);
  });

  it('returns false when language is Go and no package.json', () => {
    expect(isNodeRepo('Go', false)).toBe(false);
  });

  it('returns false when language is Rust and no package.json', () => {
    expect(isNodeRepo('Rust', false)).toBe(false);
  });

  it('returns false when language is Java and no package.json', () => {
    expect(isNodeRepo('Java', false)).toBe(false);
  });

  it('returns false for language "javascript" (wrong case) and no package.json', () => {
    expect(isNodeRepo('javascript', false)).toBe(false);
  });

  it('returns false for language "typescript" (wrong case) and no package.json', () => {
    expect(isNodeRepo('typescript', false)).toBe(false);
  });
});

// ── Property-based tests ─────────────────────────────────────────────────────

describe('isNodeRepo – property tests', () => {
  /**
   * hasPackageJson=true is always sufficient to return true, regardless of language.
   */
  it('always true when hasPackageJson is true', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        (language) => {
          return isNodeRepo(language, true) === true;
        },
      ),
    );
  });

  /**
   * Without package.json, only the two canonical language values return true.
   */
  it('without package.json: returns true only for JavaScript or TypeScript', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        (language) => {
          const result = isNodeRepo(language, false);
          if (language === 'JavaScript' || language === 'TypeScript') {
            return result === true;
          }
          return result === false;
        },
      ),
    );
  });

  /**
   * The return value is always a boolean (never null/undefined).
   */
  it('always returns a boolean', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.boolean(),
        (language, hasPackageJson) => {
          const result = isNodeRepo(language, hasPackageJson);
          return typeof result === 'boolean';
        },
      ),
    );
  });

  /**
   * Exhaustive check over the specific Node language values × both boolean states.
   */
  it('exhaustive: JavaScript and TypeScript always return true regardless of hasPackageJson', () => {
    const nodeLanguages = ['JavaScript', 'TypeScript'] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...nodeLanguages),
        fc.boolean(),
        (language, hasPackageJson) => {
          return isNodeRepo(language, hasPackageJson) === true;
        },
      ),
    );
  });

  /**
   * Non-Node language with no package.json always returns false.
   */
  it('non-Node language and no package.json always returns false', () => {
    // Languages that are neither JavaScript nor TypeScript
    const nonNodeLanguages = ['Python', 'Go', 'Rust', 'Java', 'Ruby', 'C', 'C++', 'C#', 'PHP'];
    fc.assert(
      fc.property(
        fc.constantFrom(...nonNodeLanguages),
        (language) => {
          return isNodeRepo(language, false) === false;
        },
      ),
    );
  });
});
