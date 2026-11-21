import type { AutopsyReport } from '../src/types.js';
import type { LlmConfig, LlmProvider } from './types.js';
import { NoneProvider } from './none-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { LocalProvider } from './local-provider.js';

export type { LlmProvider, LlmConfig } from './types.js';
export { NoneProvider, buildNarrative } from './none-provider.js';

/**
 * Instantiates the LLM provider described by `config`.
 *
 * Throws if a required config value is missing for the selected provider.
 * Use `generateNarrative` for the full call with automatic fallback.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'local':
      return new LocalProvider(config);
    case 'none':
      return new NoneProvider();
  }
}

/**
 * Builds the LLM config from environment variables and generates a narrative
 * for the given `AutopsyReport`.
 *
 * Falls back to the none-provider on any error so the report always renders.
 * Never logs API keys; never forwards secrets to the LLM.
 */
export async function generateNarrative(report: AutopsyReport): Promise<string> {
  const rawProvider = process.env['LLM_PROVIDER'] ?? 'none';
  const providerName = rawProvider === 'anthropic' || rawProvider === 'local' ? rawProvider : 'none';

  const config: LlmConfig = { provider: providerName };
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  if (anthropicApiKey !== undefined) config.anthropicApiKey = anthropicApiKey;
  const anthropicModel = process.env['ANTHROPIC_MODEL'];
  if (anthropicModel !== undefined) config.anthropicModel = anthropicModel;
  const localBaseUrl = process.env['LOCAL_LLM_BASE_URL'];
  if (localBaseUrl !== undefined) config.localBaseUrl = localBaseUrl;
  const localModel = process.env['LOCAL_LLM_MODEL'];
  if (localModel !== undefined) config.localModel = localModel;

  let provider: LlmProvider;
  try {
    provider = createLlmProvider(config);
  } catch {
    // Config construction failed (e.g. missing API key); fall back silently.
    provider = new NoneProvider();
  }

  try {
    return await provider.generateNarrative(report);
  } catch (err) {
    console.error('[llm] generateNarrative failed, falling back to none-provider:', err);
    const fallback = new NoneProvider();
    return fallback.generateNarrative(report);
  }
}
