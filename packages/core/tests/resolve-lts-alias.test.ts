import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveLtsAlias } from '../src/resolve-lts-alias.js';

// ── Known aliases with lts/ prefix ───────────────────────────────────────────

describe('resolveLtsAlias – known aliases with lts/ prefix', () => {
  it('resolves lts/argon to 4', () => {
    expect(resolveLtsAlias('lts/argon')).toBe(4);
  });

  it('resolves lts/boron to 6', () => {
    expect(resolveLtsAlias('lts/boron')).toBe(6);
  });

  it('resolves lts/carbon to 8', () => {
    expect(resolveLtsAlias('lts/carbon')).toBe(8);
  });

  it('resolves lts/dubnium to 10', () => {
    expect(resolveLtsAlias('lts/dubnium')).toBe(10);
  });

  it('resolves lts/erbium to 12', () => {
    expect(resolveLtsAlias('lts/erbium')).toBe(12);
  });

  it('resolves lts/fermium to 14', () => {
    expect(resolveLtsAlias('lts/fermium')).toBe(14);
  });

  it('resolves lts/gallium to 16', () => {
    expect(resolveLtsAlias('lts/gallium')).toBe(16);
  });

  it('resolves lts/hydrogen to 18', () => {
    expect(resolveLtsAlias('lts/hydrogen')).toBe(18);
  });

  it('resolves lts/iron to 20', () => {
    expect(resolveLtsAlias('lts/iron')).toBe(20);
  });

  it('resolves lts/jod to 22', () => {
    expect(resolveLtsAlias('lts/jod')).toBe(22);
  });
});

// ── Known aliases without lts/ prefix ────────────────────────────────────────

describe('resolveLtsAlias – bare codename (no lts/ prefix)', () => {
  it('resolves argon to 4', () => {
    expect(resolveLtsAlias('argon')).toBe(4);
  });

  it('resolves hydrogen to 18', () => {
    expect(resolveLtsAlias('hydrogen')).toBe(18);
  });

  it('resolves iron to 20', () => {
    expect(resolveLtsAlias('iron')).toBe(20);
  });

  it('resolves jod to 22', () => {
    expect(resolveLtsAlias('jod')).toBe(22);
  });
});

// ── Case-insensitivity ────────────────────────────────────────────────────────

describe('resolveLtsAlias – case insensitivity', () => {
  it('resolves LTS/Hydrogen (mixed case) to 18', () => {
    expect(resolveLtsAlias('LTS/Hydrogen')).toBe(18);
  });

  it('resolves LTS/IRON (uppercase) to 20', () => {
    expect(resolveLtsAlias('LTS/IRON')).toBe(20);
  });

  it('resolves ARGON (uppercase bare name) to 4', () => {
    expect(resolveLtsAlias('ARGON')).toBe(4);
  });

  it('resolves Carbon (title case) to 8', () => {
    expect(resolveLtsAlias('Carbon')).toBe(8);
  });
});

// ── Whitespace handling ───────────────────────────────────────────────────────

describe('resolveLtsAlias – whitespace trimming', () => {
  it('trims leading/trailing whitespace before lookup', () => {
    expect(resolveLtsAlias('  lts/hydrogen  ')).toBe(18);
  });

  it('trims whitespace from bare codename', () => {
    expect(resolveLtsAlias('\tiron\n')).toBe(20);
  });
});

// ── Unknown / unrecognised aliases ───────────────────────────────────────────

describe('resolveLtsAlias – unknown aliases', () => {
  it('returns null for an empty string', () => {
    expect(resolveLtsAlias('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(resolveLtsAlias('   ')).toBeNull();
  });

  it('returns null for a numeric string', () => {
    expect(resolveLtsAlias('18')).toBeNull();
  });

  it('returns null for a semver range', () => {
    expect(resolveLtsAlias('>=18.0.0')).toBeNull();
  });

  it('returns null for a future/invented codename', () => {
    expect(resolveLtsAlias('lts/krypton')).toBeNull();
  });

  it('returns null for "lts/" with no codename', () => {
    expect(resolveLtsAlias('lts/')).toBeNull();
  });

  it('returns null for "latest"', () => {
    expect(resolveLtsAlias('latest')).toBeNull();
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('resolveLtsAlias – property tests', () => {
  const KNOWN_ALIASES = [
    'lts/argon',
    'lts/boron',
    'lts/carbon',
    'lts/dubnium',
    'lts/erbium',
    'lts/fermium',
    'lts/gallium',
    'lts/hydrogen',
    'lts/iron',
    'lts/jod',
  ] as const;

  const EXPECTED: Record<string, number> = {
    'lts/argon': 4,
    'lts/boron': 6,
    'lts/carbon': 8,
    'lts/dubnium': 10,
    'lts/erbium': 12,
    'lts/fermium': 14,
    'lts/gallium': 16,
    'lts/hydrogen': 18,
    'lts/iron': 20,
    'lts/jod': 22,
  };

  it('all known aliases round-trip correctly regardless of case', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_ALIASES),
        // Randomly uppercase each character to test case-insensitivity.
        fc.infiniteStream(fc.boolean()),
        (alias, uppercaseDecisions) => {
          let mixed = '';
          let i = 0;
          for (const ch of alias) {
            const upper = uppercaseDecisions.next().value;
            mixed += upper ? ch.toUpperCase() : ch;
            i++;
          }
          const result = resolveLtsAlias(mixed);
          return result === (EXPECTED[alias] ?? null);
        },
      ),
    );
  });

  it('return value is always a positive integer or null', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = resolveLtsAlias(input);
        return result === null || (Number.isInteger(result) && result > 0);
      }),
    );
  });

  it('arbitrary strings not in the table return null', () => {
    // Build a set of all known codenames (without prefix) for fast membership check.
    const knownCodenames = new Set([
      'argon', 'boron', 'carbon', 'dubnium', 'erbium',
      'fermium', 'gallium', 'hydrogen', 'iron', 'jod',
    ]);

    fc.assert(
      fc.property(
        // Generate strings that cannot be an lts/codename alias.
        fc.string().filter((s) => {
          const norm = s.trim().toLowerCase();
          const codename = norm.startsWith('lts/') ? norm.slice(4) : norm;
          return !knownCodenames.has(codename);
        }),
        (input) => {
          return resolveLtsAlias(input) === null;
        },
      ),
    );
  });

  it('known aliases always return a number, never null', () => {
    fc.assert(
      fc.property(fc.constantFrom(...KNOWN_ALIASES), (alias) => {
        return resolveLtsAlias(alias) !== null;
      }),
    );
  });
});
