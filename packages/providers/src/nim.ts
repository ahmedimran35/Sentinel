import { OpenAICompatProvider, type OpenAICompatConfig } from './openai-compat.js';

export interface NIMConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function createNIMProvider(config: NIMConfig): OpenAICompatProvider {
  const openAIConfig: OpenAICompatConfig = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
  };

  return new OpenAICompatProvider(openAIConfig, { input: 0.0005, output: 0.001 });
}
