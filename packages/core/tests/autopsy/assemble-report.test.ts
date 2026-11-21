import { describe, it, expect } from 'vitest';
import { assembleReport } from '../../src/autopsy/assemble-report.js';
import type { AutopsyFinding, AutopsyReport } from '../../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const eolFinding: AutopsyFinding = {
  id: 'node-eol',
  category: 'runtime',
  severity: 'fatal',
  title: 'Node.js 12 is EOL',
  evidence: 'Node.js 12 reached end-of-life on 2022-04-30',
  fixHint: 'Upgrade to Node.js 22 LTS.',
};

const lockfileFinding: AutopsyFinding = {
  id: 'missing-lockfile',
  category: 'hygiene',
  severity: 'serious',
  title: 'No lockfile found',
  evidence: 'No package-lock.json, yarn.lock, or pnpm-lock.yaml in repo root',
  fixHint: 'Run npm install to generate package-lock.json.',
};

const fixedNow = new Date('2024-10-31T00:00:00.000Z');

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('assembleReport – unit tests', () => {
  it('returns an AutopsyReport with the correct owner and name', () => {
    const report = assembleReport('acme', 'my-app', [], null, 'narrative', 0, fixedNow);
    expect(report.owner).toBe('acme');
    expect(report.name).toBe('my-app');
  });

  it('sets generatedAt to the ISO string of the provided now date', () => {
    const report = assembleReport('a', 'b', [], null, 'narrative', 0, fixedNow);
    expect(report.generatedAt).toBe('2024-10-31T00:00:00.000Z');
  });

  it('uses a real Date when now is omitted', () => {
    const before = new Date().toISOString();
    const report = assembleReport('a', 'b', [], null, 'narrative', 0);
    const after = new Date().toISOString();
    // generatedAt is a valid ISO string between before and after
    expect(report.generatedAt >= before).toBe(true);
    expect(report.generatedAt <= after).toBe(true);
  });

  it('propagates the findings array by reference', () => {
    const findings = [eolFinding, lockfileFinding];
    const report = assembleReport('a', 'b', findings, eolFinding, 'text', 0, fixedNow);
    expect(report.findings).toBe(findings);
  });

  it('propagates causeOfDeath by reference', () => {
    const report = assembleReport('a', 'b', [eolFinding], eolFinding, 'text', 0, fixedNow);
    expect(report.causeOfDeath).toBe(eolFinding);
  });

  it('allows causeOfDeath to be null', () => {
    const report = assembleReport('a', 'b', [], null, 'narrative', 0, fixedNow);
    expect(report.causeOfDeath).toBeNull();
  });

  it('propagates the narrative string', () => {
    const narrative = 'This repo died of old age.';
    const report = assembleReport('a', 'b', [], null, narrative, 0, fixedNow);
    expect(report.narrative).toBe(narrative);
  });

  it('propagates truncatedDepCount as 0 when no deps were truncated', () => {
    const report = assembleReport('a', 'b', [], null, 'narrative', 0, fixedNow);
    expect(report.truncatedDepCount).toBe(0);
  });

  it('propagates a positive truncatedDepCount', () => {
    const report = assembleReport('a', 'b', [], null, 'narrative', 42, fixedNow);
    expect(report.truncatedDepCount).toBe(42);
  });

  it('returns an object with all required AutopsyReport fields', () => {
    const report = assembleReport(
      'owner', 'repo',
      [eolFinding],
      eolFinding,
      'some narrative',
      5,
      fixedNow,
    );
    const keys: Array<keyof AutopsyReport> = [
      'owner', 'name', 'generatedAt', 'findings', 'causeOfDeath', 'narrative', 'truncatedDepCount',
    ];
    for (const key of keys) {
      expect(key in report).toBe(true);
    }
  });

  it('generatedAt is a valid ISO 8601 string', () => {
    const report = assembleReport('a', 'b', [], null, 'x', 0, fixedNow);
    // Must parse back to the same timestamp
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('generatedAt ends with Z (UTC)', () => {
    const report = assembleReport('a', 'b', [], null, 'x', 0, fixedNow);
    expect(report.generatedAt.endsWith('Z')).toBe(true);
  });

  it('does not add extra fields beyond the AutopsyReport shape', () => {
    const report = assembleReport('a', 'b', [], null, 'x', 0, fixedNow);
    const expectedKeys = new Set([
      'owner', 'name', 'generatedAt', 'findings', 'causeOfDeath', 'narrative', 'truncatedDepCount',
    ]);
    for (const key of Object.keys(report)) {
      expect(expectedKeys.has(key)).toBe(true);
    }
  });

  it('handles an empty narrative string', () => {
    const report = assembleReport('a', 'b', [], null, '', 0, fixedNow);
    expect(report.narrative).toBe('');
  });

  it('handles findings with multiple entries', () => {
    const findings = [eolFinding, lockfileFinding];
    const report = assembleReport('a', 'b', findings, eolFinding, 'text', 0, fixedNow);
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0]?.id).toBe('node-eol');
    expect(report.findings[1]?.id).toBe('missing-lockfile');
  });

  it('two calls with the same now produce the same generatedAt', () => {
    const r1 = assembleReport('a', 'b', [], null, 'n', 0, fixedNow);
    const r2 = assembleReport('a', 'b', [], null, 'n', 0, fixedNow);
    expect(r1.generatedAt).toBe(r2.generatedAt);
  });

  it('two calls with different now values produce different generatedAt', () => {
    const r1 = assembleReport('a', 'b', [], null, 'n', 0, new Date('2024-01-01T00:00:00.000Z'));
    const r2 = assembleReport('a', 'b', [], null, 'n', 0, new Date('2024-06-15T12:00:00.000Z'));
    expect(r1.generatedAt).not.toBe(r2.generatedAt);
  });
});
