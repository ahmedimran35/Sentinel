import type { Provider } from './types.js';
import { createOpenAIProvider } from './openai-compat.js';

export interface OllamaConfig {
  model?: string;
  baseUrl?: string;
}

export function createOllamaProvider(config: OllamaConfig = {}): Provider {
  return createOpenAIProvider({
    apiKey: 'ollama',
    model: config.model ?? 'llama3.2',
    baseUrl: config.baseUrl ?? 'http://localhost:11434/v1',
  });
}
