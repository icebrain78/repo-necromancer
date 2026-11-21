import type { AutopsyReport } from '../src/types.js';
import type { LlmProvider } from './types.js';

/**
 * Deterministic LLM provider that builds a narrative from structured findings
 * without making any network call. Used as the default provider when
 * `LLM_PROVIDER` is unset, as `"none"`, and as the fallback when any real
 * provider throws.
 *
 * Output is always 3–5 sentences covering:
 * 1. Total finding count and cause of death.
 * 2. Additional issue titles (when present).
 * 3. Primary evidence from the cause of death.
 * 4. Recommended fix.
 */
export class NoneProvider implements LlmProvider {
  async generateNarrative(report: AutopsyReport): Promise<string> {
    return buildNarrative(report);
  }
}

/** Exported as a plain function so tests can call it synchronously. */
export function buildNarrative(report: AutopsyReport): string {
  const { findings, causeOfDeath } = report;

  if (findings.length === 0 || causeOfDeath === null) {
    return (
      'This repository shows no detectable signs of decay — a rare specimen indeed. ' +
      'No structural findings were uncovered during the examination. ' +
      'The codebase may still harbour hidden ailments; a live build attempt is recommended.'
    );
  }

  const otherFindings = findings.filter((f) => f.id !== causeOfDeath.id);

  // Sentence 1: total count and primary cause
  const countWord = findings.length === 1 ? '1 finding' : `${findings.length} findings`;
  const s1 = `This repository has ${countWord}, with "${causeOfDeath.title}" identified as the primary cause of death.`;

  // Sentence 2: additional issues (omitted when there are none)
  let s2 = '';
  if (otherFindings.length === 1) {
    s2 = ` One additional issue was uncovered: ${otherFindings[0]!.title}.`;
  } else if (otherFindings.length === 2) {
    s2 = ` Two additional issues were uncovered: ${otherFindings[0]!.title} and ${otherFindings[1]!.title}.`;
  } else if (otherFindings.length > 2) {
    const listed = otherFindings
      .slice(0, 2)
      .map((f) => f.title)
      .join(', ');
    s2 = ` ${otherFindings.length} additional issues were uncovered, including ${listed}.`;
  }

  // Sentence 3: primary evidence
  const s3 = ` The evidence shows: ${causeOfDeath.evidence}.`;

  // Sentence 4: recommended fix
  const s4 = ` Recommended action: ${causeOfDeath.fixHint}`;
  const s4Final = s4.endsWith('.') ? s4 : s4 + '.';

  return s1 + s2 + s3 + s4Final;
}
