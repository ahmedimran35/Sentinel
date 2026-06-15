import type { Provider } from '@sentinel/providers';
import { registerProvider, createProvider as registryCreateProvider, getProviderNames } from '@sentinel/providers';

async function ensureBuiltinProviders(): Promise<void> {
  const names = getProviderNames();
  if (names.length > 0) return;

  const { AnthropicProvider } = await import('@sentinel/providers');
  const { createOpenAIProvider } = await import('@sentinel/providers');
  const { createNIMProvider } = await import('@sentinel/providers');
  const { GeminiProvider } = await import('@sentinel/providers');
  const { createOpenRouterProvider } = await import('@sentinel/providers');
  const { createOllamaProvider } = await import('@sentinel/providers');

  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? process.env.SENTINEL_API_KEY ?? '';
  const openaiKey = process.env.OPENAI_API_KEY ?? '';
  const nimKey = process.env.NVIDIA_API_KEY ?? '';
  const geminiKey = process.env.GEMINI_API_KEY ?? '';
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? '';
  const customKey = process.env.CUSTOM_API_KEY ?? '';
  const customBaseUrl = process.env.CUSTOM_BASE_URL ?? '';
  const customModel = process.env.CUSTOM_MODEL ?? '';

  registerProvider('anthropic', (model: string) => ({
    provider: new AnthropicProvider({ apiKey: anthropicKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0.003, output: 0.015 },
  }));
  registerProvider('claude', (model: string) => ({
    provider: new AnthropicProvider({ apiKey: anthropicKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0.003, output: 0.015 },
  }));
  registerProvider('openai', (model: string) => ({
    provider: createOpenAIProvider({ apiKey: openaiKey, model, baseUrl: 'https://api.openai.com/v1' }) as unknown as Provider,
    costPer1kTokens: { input: 0.003, output: 0.015 },
  }));
  registerProvider('nim', (model: string) => ({
    provider: createNIMProvider({ apiKey: nimKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0, output: 0.005 },
  }));
  registerProvider('nvidia', (model: string) => ({
    provider: createNIMProvider({ apiKey: nimKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0, output: 0.005 },
  }));
  registerProvider('gemini', (model: string) => ({
    provider: new GeminiProvider({ apiKey: geminiKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0.0025, output: 0.01 },
  }));
  registerProvider('openrouter', (model: string) => ({
    provider: createOpenRouterProvider({ apiKey: openrouterKey, model }) as unknown as Provider,
    costPer1kTokens: { input: 0, output: 0 },
  }));
  registerProvider('custom', (model: string) => ({
    provider: createOpenAIProvider({
      apiKey: customKey,
      model: customModel || model || 'gpt-4o',
      baseUrl: customBaseUrl || 'https://api.openai.com/v1',
    }) as unknown as Provider,
    costPer1kTokens: { input: 0.003, output: 0.015 },
  }));
  registerProvider('ollama', (model: string) => ({
    provider: createOllamaProvider({
      model,
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    }) as unknown as Provider,
    costPer1kTokens: { input: 0, output: 0 },
  }));
}

export async function createProvider(providerName: string, model: string, _baseUrl?: string): Promise<Provider> {
  await ensureBuiltinProviders();

  if (!getProviderNames().includes(providerName)) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${getProviderNames().join(', ')}`);
  }

  return registryCreateProvider(providerName, model);
}

export function listProviders(): string[] {
  return getProviderNames();
}

export { registerProvider } from '@sentinel/providers';
