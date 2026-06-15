import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';

export interface ProviderMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
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
