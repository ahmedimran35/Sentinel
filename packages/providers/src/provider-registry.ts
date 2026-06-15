import type { Provider } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { createOpenAIProvider } from './openai-compat.js';
import { createNIMProvider } from './nim.js';
import { GeminiProvider } from './gemini.js';
import { createOpenRouterProvider } from './openrouter.js';
import { createOllamaProvider } from './ollama.js';

export interface ProviderFactoryResult {
  provider: Provider;
  costPer1kTokens: { input: number; output: number };
}

export type ProviderFactory = (model: string) => ProviderFactoryResult | Promise<ProviderFactoryResult>;

const registry = new Map<string, ProviderFactory>();

export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

export function getProviderNames(): string[] {
  return Array.from(registry.keys());
}

export function hasProvider(name: string): boolean {
  return registry.has(name);
}

export async function createProvider(name: string, model: string): Promise<Provider> {
  const factory = registry.get(name);
  if (!factory) throw new Error(`Unknown provider: ${name}. Available: ${getProviderNames().join(', ')}`);
  const result = await factory(model);
  return result.provider;
}

export async function createProviderWithCosts(
  name: string,
  model: string,
): Promise<ProviderFactoryResult> {

  const factory = registry.get(name);
  if (!factory) throw new Error(`Unknown provider: ${name}. Available: ${getProviderNames().join(', ')}`);
  return factory(model);
}

function getApiKey(name: string): string {
  const envMap: Record<string, string> = {
    anthropic: process.env.ANTHROPIC_API_KEY ?? process.env.SENTINEL_API_KEY ?? '',
    claude: process.env.ANTHROPIC_API_KEY ?? process.env.SENTINEL_API_KEY ?? '',
    openai: process.env.OPENAI_API_KEY ?? '',
    openrouter: process.env.OPENROUTER_API_KEY ?? '',
    nim: process.env.NVIDIA_API_KEY ?? process.env.NIM_API_KEY ?? '',
    nvidia: process.env.NVIDIA_API_KEY ?? process.env.NIM_API_KEY ?? '',
    gemini: process.env.GEMINI_API_KEY ?? '',
    ollama: 'ollama',
  };
  return envMap[name] ?? process.env.ANTHROPIC_API_KEY ?? '';
}

registerProvider('anthropic', (model: string) => {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  return {
    provider: new AnthropicProvider({ apiKey, model }),
    costPer1kTokens: { input: 0.003, output: 0.015 },
  };
});

registerProvider('claude', (model: string) => {
  const apiKey = getApiKey('claude');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  return {
    provider: new AnthropicProvider({ apiKey, model }),
    costPer1kTokens: { input: 0.003, output: 0.015 },
  };
});

registerProvider('openai', (model: string) => {
  const apiKey = getApiKey('openai');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  return {
    provider: createOpenAIProvider({ apiKey, model, baseUrl: 'https://api.openai.com/v1' }),
    costPer1kTokens: { input: 0.003, output: 0.015 },
  };
});

registerProvider('openrouter', (model: string) => {
  const apiKey = getApiKey('openrouter');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  return {
    provider: createOpenRouterProvider({ apiKey, model }),
    costPer1kTokens: { input: 0, output: 0 },
  };
});

registerProvider('nim', (model: string) => {
  const apiKey = getApiKey('nim');
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
  return {
    provider: createNIMProvider({ apiKey, model }),
    costPer1kTokens: { input: 0, output: 0.005 },
  };
});

registerProvider('nvidia', (model: string) => {
  const apiKey = getApiKey('nvidia');
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
  return {
    provider: createNIMProvider({ apiKey, model }),
    costPer1kTokens: { input: 0, output: 0.005 },
  };
});

registerProvider('gemini', (model: string) => {
  const apiKey = getApiKey('gemini');
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return {
    provider: new GeminiProvider({ apiKey, model }),
    costPer1kTokens: { input: 0.0025, output: 0.01 },
  };
});

registerProvider('ollama', (model: string) => {
  return {
    provider: createOllamaProvider({ model, baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' }),
    costPer1kTokens: { input: 0, output: 0 },
  };
});
