import type { Provider } from './types.js';
import { OpenAICompatProvider } from './openai-compat.js';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export function createOpenRouterProvider(
  config: OpenRouterConfig,
  costs?: { input: number; output: number },
): Provider {
  return new OpenAICompatProvider(
    {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl ?? 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': config.headers?.['HTTP-Referer'] ?? 'https://github.com/anomalyco/sentinel',
        'X-Title': config.headers?.['X-Title'] ?? 'Sentinel',
        ...config.headers,
      },
    },
    costs,
  );
}
