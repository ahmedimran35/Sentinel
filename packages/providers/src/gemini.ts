import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from './types.js';
import { parseSSE, parseJSONData } from './sse-parser.js';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface GeminiContent {
  role?: string;
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
}

interface GeminiStreamCandidate {
  content?: GeminiContent;
  finishReason?: string;
}

interface GeminiStreamResponse {
  candidates?: GeminiStreamCandidate[];
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

export class GeminiProvider implements Provider {
  costPer1kTokens: { input: number; output: number };

  constructor(
    private config: GeminiConfig,
    costs?: { input: number; output: number },
  ) {
    this.costPer1kTokens = costs ?? { input: 0.0025, output: 0.01 };
    this.config.baseUrl ??= 'https://generativelanguage.googleapis.com/v1beta';
  }

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    _config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const baseUrl = this.config.baseUrl!;
    const url = `${baseUrl}/models/${this.config.model}:streamGenerateContent?alt=sse`;

    const geminiContents: GeminiContent[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content ?? '' }],
      }));

    const systemInstruction = messages.find((m) => m.role === 'system');

    const body: Record<string, unknown> = {
      contents: geminiContents,
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw Object.assign(new Error(`Gemini API error ${response.status}: ${errorBody}`), {
        status: response.status,
      });
    }

    const bodyStream = response.body;
    let tokenUsage: { input: number; output: number } | undefined;

    if (!bodyStream) {
      yield { type: 'turn_end', turnId: 'gemini' };
      return;
    }

    for await (const msg of parseSSE(bodyStream, signal)) {
      const parsed = parseJSONData<GeminiStreamResponse>(msg);

      if (parsed.usageMetadata) {
        tokenUsage = {
          input: parsed.usageMetadata.promptTokenCount,
          output: parsed.usageMetadata.candidatesTokenCount,
        };
      }

      if (!parsed.candidates) continue;

      for (const candidate of parsed.candidates) {
        const content = candidate.content;
        if (!content) continue;

        for (const part of content.parts) {
          if (part.text) {
            yield { type: 'text_delta', turnId: 'gemini', delta: part.text };
          }
          if (part.functionCall) {
            yield {
              type: 'tool_call_start',
              turnId: 'gemini',
              call: {
                id: `fc_${part.functionCall.name}`,
                name: part.functionCall.name,
                args: part.functionCall.args as Record<string, unknown>,
              },
            };
          }
        }
      }
    }

    yield { type: 'turn_end', turnId: 'gemini', usage: tokenUsage };
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
