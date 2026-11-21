import { describe, it, expect } from 'vitest';
import { NoneProvider, buildNarrative } from '../../llm/none-provider.js';
import type { AutopsyFinding, AutopsyReport } from '../../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const eolFinding: AutopsyFinding = {
  id: 'node-eol',
  category: 'runtime',
  severity: 'fatal',
  title: 'Node.js 12 is end-of-life',
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

const deprecatedFinding: AutopsyFinding = {
  id: 'deprecated-deps',
  category: 'deprecated-deps',
  severity: 'fatal',
  title: '2 deprecated dependencies found',
  evidence: 'request: request is deprecated, left-pad: left-pad is deprecated',
  fixHint: 'Replace each deprecated package with a maintained alternative.',
};

function makeReport(overrides: Partial<AutopsyReport> = {}): AutopsyReport {
  return {
    owner: 'acme',
    name: 'my-app',
    generatedAt: '2024-10-31T00:00:00.000Z',
    findings: [eolFinding],
    causeOfDeath: eolFinding,
    narrative: '',
    truncatedDepCount: 0,
    ...overrides,
  };
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('NoneProvider – unit tests', () => {
  it('returns a non-empty string', async () => {
    const provider = new NoneProvider();
    const result = await provider.generateNarrative(makeReport());
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains the cause-of-death title', async () => {
    const provider = new NoneProvider();
    const result = await provider.generateNarrative(makeReport());
    expect(result).toContain(eolFinding.title);
  });

  it('contains the cause-of-death evidence', async () => {
    const provider = new NoneProvider();
    const result = await provider.generateNarrative(makeReport());
    expect(result).toContain('2022-04-30');
  });

  it('contains the fix hint', async () => {
    const provider = new NoneProvider();
    const result = await provider.generateNarrative(makeReport());
    expect(result).toContain('Upgrade to Node.js 22 LTS');
  });

  it('mentions the finding count', async () => {
    const provider = new NoneProvider();
    const report = makeReport({ findings: [eolFinding, lockfileFinding], causeOfDeath: eolFinding });
    const result = await provider.generateNarrative(report);
    expect(result).toContain('2');
  });

  it('mentions additional finding titles when present', async () => {
    const provider = new NoneProvider();
    const report = makeReport({ findings: [eolFinding, lockfileFinding], causeOfDeath: eolFinding });
    const result = await provider.generateNarrative(report);
    expect(result).toContain(lockfileFinding.title);
  });

  it('handles a report with exactly 1 finding', async () => {
    const provider = new NoneProvider();
    const result = await provider.generateNarrative(makeReport());
    expect(result).toContain('1 finding');
  });

  it('returns a sensible fallback when findings is empty', async () => {
    const provider = new NoneProvider();
    const report = makeReport({ findings: [], causeOfDeath: null });
    const result = await provider.generateNarrative(report);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a sensible fallback when causeOfDeath is null but findings exist', async () => {
    // This should not happen in practice, but the provider must not throw.
    const provider = new NoneProvider();
    const report = makeReport({ findings: [eolFinding], causeOfDeath: null });
    const result = await provider.generateNarrative(report);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── buildNarrative (synchronous export) ──────────────────────────────────────

describe('buildNarrative – unit tests', () => {
  it('returns the same value as the async provider', async () => {
    const report = makeReport();
    const sync = buildNarrative(report);
    const async_ = await new NoneProvider().generateNarrative(report);
    expect(sync).toBe(async_);
  });

  it('output is always a string', () => {
    const result = buildNarrative(makeReport());
    expect(typeof result).toBe('string');
  });

  it('output is non-empty for any non-empty report', () => {
    const result = buildNarrative(makeReport({ findings: [eolFinding, lockfileFinding, deprecatedFinding], causeOfDeath: eolFinding }));
    expect(result.length).toBeGreaterThan(0);
  });

  it('output ends with a period', () => {
    const result = buildNarrative(makeReport());
    expect(result.trimEnd()).toMatch(/\.$/);
  });

  it('handles 3+ additional findings by counting them', () => {
    const extra: AutopsyFinding = {
      id: 'outdated-majors',
      category: 'outdated-majors',
      severity: 'serious',
      title: '5 dependencies are behind by one or more major versions',
      evidence: 'react: ^15.0.0 → 18.3.0',
      fixHint: 'Review each package migration guide.',
    };
    const report = makeReport({
      findings: [eolFinding, lockfileFinding, deprecatedFinding, extra],
      causeOfDeath: eolFinding,
    });
    const result = buildNarrative(report);
    // 3 additional findings — should mention the count
    expect(result).toContain('3');
  });
});

// ── No LLM_PROVIDER env var needed ───────────────────────────────────────────

describe('NoneProvider – env independence', () => {
  it('works without any LLM_PROVIDER environment variable', async () => {
    const savedEnv = process.env['LLM_PROVIDER'];
    delete process.env['LLM_PROVIDER'];
    try {
      const provider = new NoneProvider();
      const result = await provider.generateNarrative(makeReport());
      expect(result.length).toBeGreaterThan(0);
    } finally {
      if (savedEnv !== undefined) {
        process.env['LLM_PROVIDER'] = savedEnv;
      }
    }
  });
});
