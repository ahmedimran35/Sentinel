import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from './types.js';
import { parseSSE, parseJSONData } from './sse-parser.js';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicStreamEvent {
  type: string;
  content_block?: AnthropicContentBlock;
  delta?: { text?: string; partial_json?: string };
  index?: number;
  message?: { id: string };
  usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

export class AnthropicProvider implements Provider {
  costPer1kTokens: { input: number; output: number };

  constructor(
    private config: AnthropicConfig,
    costs?: { input: number; output: number },
  ) {
    this.costPer1kTokens = costs ?? { input: 0.003, output: 0.015 };
  }

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    _config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        ...this.config.headers,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.filter((m) => m.role !== 'system'),
        system: messages.find((m) => m.role === 'system')?.content,
        max_tokens: 4096,
        stream: true,
        tools: tools.length > 0
          ? tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            }))
          : undefined,
      }),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw Object.assign(new Error(`Anthropic API error ${response.status}: ${errorBody}`), {
        status: response.status,
      });
    }

    const body = response.body;
    let tokenUsage: { input: number; output: number; cache_read?: number } | undefined;

    if (!body) {
      yield { type: 'turn_end', turnId: 'anthropic', usage: tokenUsage };
      return;
    }

    let currentToolId: string | undefined;
    let currentToolArgs = '';

    for await (const msg of parseSSE(body, signal)) {
      if (msg.event === 'message_stop') break;

      const parsed = parseJSONData<AnthropicStreamEvent>(msg);

      if (parsed.type === 'message_delta' && parsed.usage) {
        tokenUsage = {
          input: parsed.usage.input_tokens,
          output: parsed.usage.output_tokens,
          cache_read: parsed.usage.cache_read_input_tokens,
        };
      }

      if (parsed.type === 'content_block_start' && parsed.content_block) {
        const block = parsed.content_block;
        if (block.type === 'tool_use') {
          currentToolId = block.id;
          currentToolArgs = '';
          yield {
            type: 'tool_call_start',
            turnId: 'anthropic',
            call: { id: block.id!, name: block.name!, args: block.input ?? {} },
          };
        }
      }

      if (parsed.type === 'content_block_delta' && parsed.delta) {
        if (parsed.delta.text) {
          yield { type: 'text_delta', turnId: 'anthropic', delta: parsed.delta.text };
        }
        if (parsed.delta.partial_json && currentToolId) {
          currentToolArgs += parsed.delta.partial_json;
          yield {
            type: 'tool_call_args_delta',
            turnId: 'anthropic',
            callId: currentToolId,
            delta: parsed.delta.partial_json,
          };
        }
      }

      if (parsed.type === 'message_start') {
        // message started, no-op
      }
    }

    yield { type: 'turn_end', turnId: 'anthropic', usage: tokenUsage };
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
