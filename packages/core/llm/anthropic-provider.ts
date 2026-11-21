import type { AutopsyReport } from '../src/types.js';
import type { LlmProvider, LlmConfig } from './types.js';

/** Stable system prompt sent with prompt-caching enabled. */
const SYSTEM_PROMPT =
  'You are a spooky but factual coroner examining dead GitHub repositories. ' +
  'Write a 3–5 sentence report using only the structured findings provided. ' +
  'Never invent package names, version numbers, or dates. ' +
  'Use atmospheric but professional language.';

/**
 * LLM provider that calls the Anthropic Claude Messages API.
 *
 * The stable system prompt is sent with `cache_control: { type: "ephemeral" }`
 * so repeated calls with the same system prompt benefit from prompt caching.
 * Cache token counts are logged to stdout on every call.
 *
 * Throws on any non-200 response; `generateNarrative` in `index.ts` catches
 * the error and falls back to the none-provider.
 */
export class AnthropicProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: Pick<LlmConfig, 'anthropicApiKey' | 'anthropicModel'>) {
    if (!config.anthropicApiKey) {
      throw new Error('AnthropicProvider: anthropicApiKey is required');
    }
    this.apiKey = config.anthropicApiKey;
    this.model = config.anthropicModel ?? 'claude-3-5-haiku-20241022';
  }

  async generateNarrative(report: AutopsyReport): Promise<string> {
    const userContent = JSON.stringify({
      causeOfDeath: report.causeOfDeath,
      findings: report.findings,
    });

    const body = {
      model: this.model,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      throw new Error(
        `Anthropic API error: ${response.status} ${response.statusText} — ${text}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as Record<string, any>;

    // Log cache token usage per REQ-A5.1 / tech steering
    const usage = data['usage'] as Record<string, number> | undefined;
    if (usage) {
      console.log(
        `[anthropic] cache_creation_input_tokens=${usage['cache_creation_input_tokens'] ?? 0}` +
        ` cache_read_input_tokens=${usage['cache_read_input_tokens'] ?? 0}`,
      );
    }

    // Extract the first text content block
    const content = data['content'] as Array<Record<string, unknown>> | undefined;
    const firstBlock = content?.[0];
    const text = firstBlock?.['type'] === 'text' ? (firstBlock['text'] as string) : '';

    if (!text) {
      throw new Error('Anthropic API returned no text content');
    }

    return text;
  }
}
