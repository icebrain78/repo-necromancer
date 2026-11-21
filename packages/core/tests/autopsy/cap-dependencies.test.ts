import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { capDependencies } from '../../src/autopsy/cap-dependencies.js';

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('capDependencies – unit tests', () => {
  it('returns all entries when count is below the limit', () => {
    const deps = { react: '^18.0.0', lodash: '^4.17.21' };
    const { capped, truncatedDepCount } = capDependencies(deps, 60);
    expect(Object.keys(capped)).toHaveLength(2);
    expect(truncatedDepCount).toBe(0);
  });

  it('returns all entries when count equals the limit', () => {
    const deps = { a: '1.0.0', b: '2.0.0', c: '3.0.0' };
    const { capped, truncatedDepCount } = capDependencies(deps, 3);
    expect(Object.keys(capped)).toHaveLength(3);
    expect(truncatedDepCount).toBe(0);
  });

  it('caps and reports truncated count when count exceeds the limit', () => {
    const deps = { a: '1.0.0', b: '2.0.0', c: '3.0.0', d: '4.0.0', e: '5.0.0' };
    const { capped, truncatedDepCount } = capDependencies(deps, 3);
    expect(Object.keys(capped)).toHaveLength(3);
    expect(truncatedDepCount).toBe(2);
  });

  it('sorts keys alphabetically before slicing', () => {
    const deps = { zebra: 'z', apple: 'a', mango: 'm', berry: 'b' };
    const { capped } = capDependencies(deps, 2);
    const keys = Object.keys(capped);
    expect(keys).toEqual(['apple', 'berry']);
  });

  it('preserves the correct values for retained keys', () => {
    const deps = { alpha: '1.0.0', beta: '2.0.0', gamma: '3.0.0' };
    const { capped } = capDependencies(deps, 2);
    expect(capped['alpha']).toBe('1.0.0');
    expect(capped['beta']).toBe('2.0.0');
    expect('gamma' in capped).toBe(false);
  });

  it('handles an empty input', () => {
    const { capped, truncatedDepCount } = capDependencies({}, 60);
    expect(Object.keys(capped)).toHaveLength(0);
    expect(truncatedDepCount).toBe(0);
  });

  it('handles limit of 0 — all deps are truncated', () => {
    const deps = { a: '1.0.0', b: '2.0.0' };
    const { capped, truncatedDepCount } = capDependencies(deps, 0);
    expect(Object.keys(capped)).toHaveLength(0);
    expect(truncatedDepCount).toBe(2);
  });

  it('does not mutate the input object', () => {
    const deps = { a: '1.0.0', b: '2.0.0', c: '3.0.0' };
    const original = { ...deps };
    capDependencies(deps, 1);
    expect(deps).toEqual(original);
  });

  it('handles a large limit gracefully (returns all deps)', () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 50; i++) deps[`pkg-${i}`] = `^${i}.0.0`;
    const { capped, truncatedDepCount } = capDependencies(deps, 60);
    expect(Object.keys(capped)).toHaveLength(50);
    expect(truncatedDepCount).toBe(0);
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────

describe('capDependencies – property tests', () => {
  /** Arbitrary dependency map: string keys → string version values. */
  const depsArb = fc.dictionary(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-0123456789'.split('')), {
      minLength: 1,
      maxLength: 20,
    }),
    fc.string({ minLength: 1, maxLength: 20 }),
    { maxKeys: 120 },
  );

  /** Arbitrary non-negative limit. */
  const limitArb = fc.nat({ max: 120 });

  /**
   * The number of keys in `capped` never exceeds the limit.
   */
  it('capped key count is always <= limit', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const { capped } = capDependencies(deps, limit);
        return Object.keys(capped).length <= limit;
      }),
    );
  });

  /**
   * truncatedDepCount equals max(0, totalKeys - limit).
   */
  it('truncatedDepCount equals max(0, total - limit)', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const total = Object.keys(deps).length;
        const { truncatedDepCount } = capDependencies(deps, limit);
        return truncatedDepCount === Math.max(0, total - limit);
      }),
    );
  });

  /**
   * The sum of capped count and truncatedDepCount always equals the total
   * number of unique keys in the input.
   */
  it('capped count + truncatedDepCount always equals total input key count', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const total = Object.keys(deps).length;
        const { capped, truncatedDepCount } = capDependencies(deps, limit);
        return Object.keys(capped).length + truncatedDepCount === total;
      }),
    );
  });

  /**
   * Every key in `capped` also exists in the original `deps` with the same value.
   */
  it('capped only contains keys and values from the original deps', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const { capped } = capDependencies(deps, limit);
        return Object.entries(capped).every(([k, v]) => deps[k] === v);
      }),
    );
  });

  /**
   * The retained keys are the alphabetically first `min(total, limit)` keys.
   */
  it('retained keys are the alphabetically first min(total, limit) keys', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const sortedKeys = Object.keys(deps).sort();
        const expectedKeys = sortedKeys.slice(0, limit);
        const { capped } = capDependencies(deps, limit);
        const actualKeys = Object.keys(capped).sort();
        return (
          actualKeys.length === expectedKeys.length &&
          actualKeys.every((k, i) => k === expectedKeys[i])
        );
      }),
    );
  });

  /**
   * The input object is never mutated.
   */
  it('never mutates the input object', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const before = JSON.stringify(Object.entries(deps).sort());
        capDependencies(deps, limit);
        const after = JSON.stringify(Object.entries(deps).sort());
        return before === after;
      }),
    );
  });

  /**
   * truncatedDepCount is always >= 0.
   */
  it('truncatedDepCount is always non-negative', () => {
    fc.assert(
      fc.property(depsArb, limitArb, (deps, limit) => {
        const { truncatedDepCount } = capDependencies(deps, limit);
        return truncatedDepCount >= 0;
      }),
    );
  });
});
