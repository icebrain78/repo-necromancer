import type { AutopsyReport } from '../src/types.js';

/**
 * Minimal interface every LLM provider must implement.
 * Implementations are responsible for their own error handling and fallback
 * behaviour is handled at the `generateNarrative` level in `index.ts`.
 */
export interface LlmProvider {
  generateNarrative(report: AutopsyReport): Promise<string>;
}

/**
 * Configuration for the LLM module.
 * Values are read from environment variables by `createLlmProvider` in
 * `index.ts`; this type exists so callers can construct configs in tests
 * without touching `process.env`.
 */
export interface LlmConfig {
  provider: 'anthropic' | 'local' | 'none';
  anthropicApiKey?: string;
  anthropicModel?: string;
  localBaseUrl?: string;
  localModel?: string;
}
