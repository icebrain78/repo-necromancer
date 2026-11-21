import type { AutopsyReport } from '../src/types.js';
import type { LlmProvider, LlmConfig } from './types.js';

/** System prompt identical to the Anthropic provider for consistency. */
const SYSTEM_PROMPT =
  'You are a spooky but factual coroner examining dead GitHub repositories. ' +
  'Write a 3–5 sentence report using only the structured findings provided. ' +
  'Never invent package names, version numbers, or dates. ' +
  'Use atmospheric but professional language.';

/**
 * LLM provider that calls a locally-hosted OpenAI-compatible chat completions
 * endpoint (e.g. Ollama). The base URL is read from `LOCAL_LLM_BASE_URL` and
 * the model name from `LOCAL_LLM_MODEL`.
 *
 * Throws on any network or response error; `generateNarrative` in `index.ts`
 * catches the error and falls back to the none-provider.
 */
export class LocalProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: Pick<LlmConfig, 'localBaseUrl' | 'localModel'>) {
    if (!config.localBaseUrl) {
      throw new Error('LocalProvider: localBaseUrl is required');
    }
    this.baseUrl = config.localBaseUrl.replace(/\/$/, '');
    this.model = config.localModel ?? 'llama3';
  }

  async generateNarrative(report: AutopsyReport): Promise<string> {
    const userContent = JSON.stringify({
      causeOfDeath: report.causeOfDeath,
      findings: report.findings,
    });

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 512,
      stream: false,
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      throw new Error(
        `Local LLM error: ${response.status} ${response.statusText} — ${text}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as Record<string, any>;

    const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
    const text = message?.['content'] as string | undefined;

    if (!text) {
      throw new Error('Local LLM returned no content');
    }

    return text;
  }
}
