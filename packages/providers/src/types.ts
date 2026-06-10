import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';

export interface ProviderMessage {
  role: string;
  content: string;
}

export interface Provider {
  streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent>;
  countTokens(text: string): number;
  costPer1kTokens: { input: number; output: number };
}
