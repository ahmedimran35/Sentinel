import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from './types.js';
import { parseSSE, parseJSONData } from './sse-parser.js';

export interface OpenAICompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OpenAIChoice {
  delta: { content?: string; tool_calls?: Array<OpenAIToolCallDelta> };
  finish_reason: string | null;
  index: number;
}

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: { name?: string; arguments?: string };
}

interface OpenAIStreamChunk {
  choices: OpenAIChoice[];
}

export function createOpenAIProvider(
  config: OpenAICompatConfig,
  costs?: { input: number; output: number },
): Provider {
  return new OpenAICompatProvider(config, costs);
}

export class OpenAICompatProvider implements Provider {
  costPer1kTokens: { input: number; output: number };

  constructor(
    private config: OpenAICompatConfig,
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
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        tools: tools.length > 0
          ? tools.map((t) => ({
              type: 'function' as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            }))
          : undefined,
      }),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw Object.assign(new Error(`OpenAI API error ${response.status}: ${errorBody}`), {
        status: response.status,
      });
    }

    const body = response.body;
    if (!body) {
      yield { type: 'turn_end', turnId: 'openai' };
      return;
    }

    const toolDeltas = new Map<number, { id?: string; name?: string; args: string }>();

    for await (const msg of parseSSE(body, signal)) {
      if (msg.data === '[DONE]') break;

      const parsed = parseJSONData<OpenAIStreamChunk>(msg);

      for (const choice of parsed.choices) {
        const delta = choice.delta;

        if (delta.content) {
          yield { type: 'text_delta', turnId: 'openai', delta: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            let existing = toolDeltas.get(tc.index);
            if (!existing) {
              existing = { args: '' };
              toolDeltas.set(tc.index, existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;

            if (tc.function?.arguments) {
              existing.args += tc.function.arguments;

              if (existing.id && existing.name) {
                yield {
                  type: 'tool_call_args_delta',
                  turnId: 'openai',
                  callId: existing.id,
                  delta: tc.function.arguments,
                };
              }
            }
          }
        }
      }
    }

    for (const [, delta] of toolDeltas) {
      if (delta.id && delta.name) {
        yield {
          type: 'tool_call_start',
          turnId: 'openai',
          call: {
            id: delta.id,
            name: delta.name,
            args: delta.args ? JSON.parse(delta.args) as Record<string, unknown> : {},
          },
        };
      }
    }

    yield { type: 'turn_end', turnId: 'openai' };
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
