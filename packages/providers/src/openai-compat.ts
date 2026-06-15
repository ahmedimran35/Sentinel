import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import { sanitizeJson } from '@sentinel/shared';
import type { Provider, ProviderMessage } from './types.js';
import { parseSSE, parseJSONData } from './sse-parser.js';
import { z } from 'zod';

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, val] of Object.entries(shape)) {
      if (val instanceof z.ZodType) {
        properties[key] = zodToJsonSchema(val);
        if (!(val instanceof z.ZodOptional) && !(val._def?.innerType instanceof z.ZodOptional)) {
          const isOptional = val.isOptional?.() ?? val instanceof z.ZodOptional;
          if (!isOptional) required.push(key);
        }
      }
    }
    return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray) return { type: 'array', items: zodToJsonSchema(schema._def.type) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema._def.values };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  return { type: 'string' };
}

export interface OpenAICompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  headers?: Record<string, string>;
  chunkTimeout?: number;
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
  usage?: { prompt_tokens: number; completion_tokens: number };
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
    const toolDefs = tools.length > 0
      ? tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.inputSchema as z.ZodTypeAny),
          },
        }))
      : undefined;

    const body = JSON.stringify({
      model: this.config.model,
      messages: messages.map((m) => {
        const msg: Record<string, unknown> = { role: m.role };
        if (m.tool_calls) {
          msg.content = null;
          msg.tool_calls = m.tool_calls;
        } else {
          msg.content = m.content;
        }
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        return msg;
      }),
      stream: true,
      tools: toolDefs,
    });

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body,
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw Object.assign(new Error(`OpenAI API error ${response.status}: ${errorBody}`), {
        status: response.status,
      });
    }

    const respBody = response.body;
    const toolDeltas = new Map<number, { id?: string; name?: string; args: string }>();
    let tokenUsage: { input: number; output: number } | undefined;

    if (!respBody) {
      yield { type: 'turn_end', turnId: 'openai', usage: tokenUsage };
      return;
    }

    for await (const msg of parseSSE(respBody, signal, this.config.chunkTimeout)) {
      if (msg.data === '[DONE]') break;

      const parsed = parseJSONData<OpenAIStreamChunk>(msg);

      if (parsed.usage) {
        tokenUsage = { input: parsed.usage.prompt_tokens, output: parsed.usage.completion_tokens };
      }

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
            args: delta.args ? sanitizeJson(delta.args) as Record<string, unknown> : {},
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
