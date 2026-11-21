import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractNodeVersion } from '../src/extract-node-version.js';

// ── Unit tests: engines.node (priority 1) ────────────────────────────────────

describe('extractNodeVersion – engines.node', () => {
  it('extracts major from plain integer string', () => {
    expect(extractNodeVersion('18', undefined)).toBe('18');
  });

  it('extracts major from v-prefixed version', () => {
    expect(extractNodeVersion('v18', undefined)).toBe('18');
  });

  it('extracts major from full semver', () => {
    expect(extractNodeVersion('18.3.0', undefined)).toBe('18');
  });

  it('extracts major from >= range', () => {
    expect(extractNodeVersion('>=16', undefined)).toBe('16');
  });

  it('extracts major from >= range with patch', () => {
    expect(extractNodeVersion('>=16.0.0', undefined)).toBe('16');
  });

  it('extracts leading bound from compound range', () => {
    expect(extractNodeVersion('>=16.0.0 <18', undefined)).toBe('16');
  });

  it('extracts major from ^ prefix', () => {
    expect(extractNodeVersion('^14.0.0', undefined)).toBe('14');
  });

  it('extracts major from ~ prefix', () => {
    expect(extractNodeVersion('~12.0.0', undefined)).toBe('12');
  });

  it('extracts major from <= range', () => {
    expect(extractNodeVersion('<=20', undefined)).toBe('20');
  });

  it('extracts major from > range', () => {
    expect(extractNodeVersion('>8', undefined)).toBe('8');
  });

  it('extracts major from v-prefix with patch version', () => {
    expect(extractNodeVersion('v14.17.6', undefined)).toBe('14');
  });

  it('returns null for empty string', () => {
    expect(extractNodeVersion('', undefined)).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractNodeVersion('   ', undefined)).toBeNull();
  });

  it('returns null for a non-version string', () => {
    expect(extractNodeVersion('latest', undefined)).toBeNull();
  });

  it('returns lts alias as-is for caller resolution', () => {
    expect(extractNodeVersion('lts/hydrogen', undefined)).toBe('lts/hydrogen');
  });

  it('normalises lts alias to lowercase', () => {
    expect(extractNodeVersion('LTS/Hydrogen', undefined)).toBe('lts/hydrogen');
  });
});

// ── Unit tests: .nvmrc (priority 2) ──────────────────────────────────────────

describe('extractNodeVersion – nvmrc fallback', () => {
  it('extracts major from plain integer', () => {
    expect(extractNodeVersion(undefined, '18')).toBe('18');
  });

  it('extracts major from v-prefixed version', () => {
    expect(extractNodeVersion(undefined, 'v18')).toBe('18');
  });

  it('extracts major from full semver', () => {
    expect(extractNodeVersion(undefined, '18.3.0')).toBe('18');
  });

  it('strips trailing newline from .nvmrc', () => {
    expect(extractNodeVersion(undefined, 'v16\n')).toBe('16');
  });

  it('strips trailing whitespace from .nvmrc line', () => {
    expect(extractNodeVersion(undefined, 'v20  ')).toBe('20');
  });

  it('uses first non-empty line when .nvmrc has multiple lines', () => {
    expect(extractNodeVersion(undefined, '\nv18\n20\n')).toBe('18');
  });

  it('returns lts alias as-is from .nvmrc', () => {
    expect(extractNodeVersion(undefined, 'lts/iron')).toBe('lts/iron');
  });

  it('returns lts alias lowercased from .nvmrc', () => {
    expect(extractNodeVersion(undefined, 'LTS/Iron')).toBe('lts/iron');
  });

  it('returns null for empty nvmrc', () => {
    expect(extractNodeVersion(undefined, '')).toBeNull();
  });

  it('returns null for whitespace-only nvmrc', () => {
    expect(extractNodeVersion(undefined, '   \n  ')).toBeNull();
  });
});

// ── Unit tests: priority and both-undefined ───────────────────────────────────

describe('extractNodeVersion – priority and edge cases', () => {
  it('prefers engines.node over nvmrc when both are present', () => {
    expect(extractNodeVersion('>=16', 'v18')).toBe('16');
  });

  it('falls back to nvmrc when engines.node is unparseable', () => {
    expect(extractNodeVersion('latest', 'v18')).toBe('18');
  });

  it('falls back to nvmrc when engines.node is empty string', () => {
    expect(extractNodeVersion('', 'v18')).toBe('18');
  });

  it('returns null when both are undefined', () => {
    expect(extractNodeVersion(undefined, undefined)).toBeNull();
  });

  it('returns null when engines.node is unparseable and nvmrc is empty', () => {
    expect(extractNodeVersion('latest', '')).toBeNull();
  });

  it('returns null when both are non-numeric non-lts strings', () => {
    expect(extractNodeVersion('latest', 'current')).toBeNull();
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('extractNodeVersion – property tests', () => {
  /**
   * Any version string starting with an optional "v" followed by one or more
   * digits must return that leading integer as a string.
   */
  it('always extracts the leading integer from vNN[-...] strings', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (major, minor, patch) => {
          const version = `v${major}.${minor}.${patch}`;
          const result = extractNodeVersion(version, undefined);
          return result === String(major);
        },
      ),
    );
  });

  /**
   * Semver ranges with >= prefix extract the leading major.
   */
  it('extracts leading major from >=N.m.p ranges', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (major, minor, patch) => {
          const range = `>=${major}.${minor}.${patch}`;
          const result = extractNodeVersion(range, undefined);
          return result === String(major);
        },
      ),
    );
  });

  /**
   * The return value is always null or a non-empty string.
   */
  it('always returns null or a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (engines, nvmrc) => {
          const result = extractNodeVersion(engines, nvmrc);
          return result === null || (typeof result === 'string' && result.length > 0);
        },
      ),
    );
  });

  /**
   * When engines.node is a valid vN string, the result always equals that major,
   * regardless of nvmrc content.
   */
  it('engines.node vN always wins over any nvmrc', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.option(fc.string(), { nil: undefined }),
        (major, nvmrc) => {
          const result = extractNodeVersion(`v${major}`, nvmrc);
          return result === String(major);
        },
      ),
    );
  });

  /**
   * When both inputs are undefined, result is always null.
   */
  it('both undefined always yields null', () => {
    expect(extractNodeVersion(undefined, undefined)).toBeNull();
  });

  /**
   * Known LTS alias strings from engines.node are returned unchanged (lowercased)
   * rather than treated as numeric versions.
   */
  it('lts/alias inputs are returned as lowercase lts/alias strings', () => {
    const aliases = [
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
    fc.assert(
      fc.property(fc.constantFrom(...aliases), (alias) => {
        const result = extractNodeVersion(alias, undefined);
        return result === alias;
      }),
    );
  });

  /**
   * nvmrc content that is a plain integer string with optional trailing newline
   * yields the same integer as a string.
   */
  it('plain integer nvmrc (with optional trailing newline) yields that integer', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 99 }),
        fc.boolean(),
        (major, addNewline) => {
          const nvmrc = addNewline ? `${major}\n` : `${major}`;
          const result = extractNodeVersion(undefined, nvmrc);
          return result === String(major);
        },
      ),
    );
  });
});
