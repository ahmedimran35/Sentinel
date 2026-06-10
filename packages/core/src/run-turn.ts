import type { SentinelEvent, ToolCall, ToolResult, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from '@sentinel/providers';
import type { Tool } from '@sentinel/shared';
import type { PermissionGate } from './permission-gate.js';

export interface RunTurnOptions {
  turnId: string;
  config: TurnConfig;
  systemPrompt: string;
  history: Array<ProviderMessage>;
  tools: Tool[];
  provider: Provider;
  gate: PermissionGate;
  signal: AbortSignal;
  onEvent?: (event: SentinelEvent) => void;
}

function toolCallsFromEvents(events: SentinelEvent[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const e of events) {
    if (e.type === 'tool_call_start') {
      calls.push(e.call);
    }
  }
  return calls;
}

function assistantMessageFromEvents(events: SentinelEvent[]): string {
  return events
    .filter((e): e is SentinelEvent & { type: 'text_delta' } => e.type === 'text_delta')
    .map((e) => e.delta)
    .join('');
}

export async function* runTurn(
  options: RunTurnOptions,
): AsyncGenerator<SentinelEvent> {
  const { turnId, config, systemPrompt, tools, provider, gate, signal } = options;
  let turnCount = 0;

  const toolMap = new Map<string, Tool>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  yield { type: 'turn_start', turnId, config };

  while (turnCount < config.maxTurns) {
    if (signal.aborted) break;

    const stream = provider.streamChat(
      [
        { role: 'system', content: systemPrompt },
        ...options.history,
      ],
      tools,
      config,
      signal,
    );

    const collectedEvents: SentinelEvent[] = [];

    for await (const event of stream) {
      if (signal.aborted) break;
      if (event.type === 'turn_end') break;
      yield event;
      collectedEvents.push(event);
      options.onEvent?.(event);
    }

    if (signal.aborted) break;

    const toolCalls = toolCallsFromEvents(collectedEvents);

    if (toolCalls.length === 0) {
      yield { type: 'turn_end', turnId };
      return;
    }

    for (const call of toolCalls) {
      const tool = toolMap.get(call.name);
      if (!tool) {
        yield {
          type: 'tool_result',
          turnId,
          result: {
            callId: call.id,
            output: `Unknown tool: ${call.name}`,
            isError: true,
          },
        };
        continue;
      }

      const permission = await gate.request(
        turnId,
        `${tool.name}(${JSON.stringify(call.args)})`,
        tool.risk,
      );

      if (permission === 'denied') {
        yield {
          type: 'tool_result',
          turnId,
          result: {
            callId: call.id,
            output: 'Permission denied by user',
            isError: true,
          },
        };
        continue;
      }

      const toolResult = await executeTool(tool, call, signal);
      yield { type: 'tool_result', turnId, result: toolResult };

      options.history.push({
        role: 'assistant',
        content: assistantMessageFromEvents(collectedEvents),
      });
      options.history.push({
        role: 'tool',
        content: toolResult.output,
      });
    }

    turnCount++;
  }

  yield { type: 'turn_end', turnId };
}

async function executeTool(
  tool: Tool,
  call: ToolCall,
  signal: AbortSignal,
): Promise<ToolResult> {
  try {
    const ctx = { sessionId: 'session_1', signal };
    const outputParts: string[] = [];

    for await (const event of tool.execute(call.args, ctx)) {
      if (event.type === 'tool_result' && event.result) {
        return event.result;
      }
      if (event.type === 'text_delta') {
        outputParts.push(event.delta);
      }
    }

    return {
      callId: call.id,
      output: outputParts.join('') || 'Tool completed (no output)',
      isError: false,
    };
  } catch (err) {
    return {
      callId: call.id,
      output: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}
