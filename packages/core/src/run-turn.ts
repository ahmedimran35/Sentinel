import type { SentinelEvent, ToolCall, ToolResult, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from '@sentinel/providers';
import type { Tool } from '@sentinel/shared';
import type { PermissionGate } from './permission-gate.js';
import type { PluginManager } from './plugin-system.js';
import type { StatsTracker } from './stats.js';
import type { SessionUndoManager } from './session-undo.js';
import type { VariantCycler } from './variant-cycler.js';

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
  accumulatedCost?: { usd: number };
  /** Optional model identifier for stats tracking */
  model?: string;
  /** Optional provider identifier for stats tracking */
  providerName?: string;
  /** Plugin manager for before/after turn/tool hooks */
  pluginManager?: PluginManager;
  /** Stats tracker for usage telemetry */
  statsTracker?: StatsTracker;
  /** Session undo manager — snapshots before each turn */
  undoManager?: SessionUndoManager;
  /** Current message index (for undo snapshots) */
  messageIndex?: number;
  /** Max chars per tool result output (default 100_000) */
  maxToolOutputChars?: number;
  /** Variant cycler for multi-variant generation */
  variantCycler?: VariantCycler;
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

function createTimeoutSignal(timeoutMs: number, parentSignal: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  if (timeoutMs <= 0) return { signal: parentSignal, cleanup: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Turn timeout after ${timeoutMs}ms`)), timeoutMs);
  const onParentAbort = () => {
    clearTimeout(timer);
    controller.abort(parentSignal.reason);
  };
  if (parentSignal.aborted) {
    clearTimeout(timer);
    controller.abort(parentSignal.reason);
    return { signal: controller.signal, cleanup: () => {} };
  }
  parentSignal.addEventListener('abort', onParentAbort, { once: true });
  const abortCleanup = () => {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onParentAbort);
  };
  controller.signal.addEventListener('abort', abortCleanup, { once: true });
  return { signal: controller.signal, cleanup: abortCleanup };
}

export async function* runTurn(
  options: RunTurnOptions,
): AsyncGenerator<SentinelEvent> {
  const {
    turnId, config, systemPrompt, tools, provider, gate, signal: parentSignal,
    pluginManager, statsTracker, undoManager, messageIndex,
    maxToolOutputChars = 100_000, variantCycler, model, providerName,
  } = options;
  let turnCount = 0;

  const toolMap = new Map<string, Tool>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  const { signal: turnSignal, cleanup: cleanupTimeout } = config.timeoutMs && config.timeoutMs > 0
    ? createTimeoutSignal(config.timeoutMs, parentSignal)
    : { signal: parentSignal, cleanup: () => {} };

  yield { type: 'turn_start', turnId, config };

  if (statsTracker && model && providerName) {
    statsTracker.trackTurnStart(turnId, model, providerName);
  }

  while (turnCount < config.maxTurns) {
    if (turnSignal.aborted) {
      if (turnSignal.reason instanceof Error && turnSignal.reason.message.includes('Timeout')) {
        yield { type: 'error', turnId, message: turnSignal.reason.message, fatal: true };
      }
      break;
    }

    if (config.maxBudgetUsd && options.accumulatedCost && options.accumulatedCost.usd >= config.maxBudgetUsd) {
      yield { type: 'compact_boundary', reason: `Budget limit reached ($${options.accumulatedCost.usd.toFixed(4)} >= $${config.maxBudgetUsd.toFixed(4)})` };
      break;
    }

    // Plugin: beforeTurn hook
    if (pluginManager) {
      const hooks = pluginManager.getHook('beforeTurn');
      for (const hook of hooks) {
        try { await hook({ turnId, turnCount, history: options.history }); }
        catch { /* isolate plugin errors */ }
      }
    }

    // Undo snapshot before turn
    if (undoManager && messageIndex !== undefined) {
      try { await undoManager.beforeTurn(turnId, messageIndex + turnCount); }
      catch { /* non-fatal */ }
    }

    // Variant cycler: push current variant into system prompt
    let turnSystemPrompt = systemPrompt;
    if (variantCycler) {
      const current = variantCycler.getCurrentVariant(turnId);
      if (current) {
        turnSystemPrompt = `${systemPrompt}\n\n======= GENERATION VARIANT =======\nVariant ID: ${current.id}\n${current.content}\n======= END VARIANT =======`;
      }
    }

    const stream = provider.streamChat(
      [
        { role: 'system', content: turnSystemPrompt },
        ...options.history,
      ],
      tools,
      config,
      turnSignal,
    );

    const collectedEvents: SentinelEvent[] = [];

    for await (const event of stream) {
      if (turnSignal.aborted) break;
      if (event.type === 'turn_end') {
        if (statsTracker && event.usage) {
          statsTracker.trackTurnEnd(turnId, event.usage);
        }
        break;
      }
      yield event;
      collectedEvents.push(event);
      options.onEvent?.(event);

      if (statsTracker) {
        statsTracker.trackEvent(event, { model, provider: providerName });
      }
    }

    if (turnSignal.aborted) break;

    const toolCalls = toolCallsFromEvents(collectedEvents);

    if (toolCalls.length === 0) {
      // Variant cycler: store the assistant text as a variant
      if (variantCycler) {
        const text = assistantMessageFromEvents(collectedEvents);
        if (text) {
          variantCycler.addVariant(turnId, text);
        }
      }
      cleanupTimeout();
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

      // Plugin: beforeToolCall hook
      if (pluginManager) {
        const hooks = pluginManager.getHook('beforeToolCall');
        for (const hook of hooks) {
          try { await hook({ turnId, toolName: call.name, args: call.args }); }
          catch { /* isolate plugin errors */ }
        }
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

      if (statsTracker) {
        statsTracker.trackToolCall(call.name);
      }

      const toolResult = await executeTool(tool, call, turnSignal, maxToolOutputChars);
      yield { type: 'tool_result', turnId, result: toolResult };

      // Plugin: afterToolCall hook
      if (pluginManager) {
        const hooks = pluginManager.getHook('afterToolCall');
        for (const hook of hooks) {
          try { await hook({ turnId, toolName: call.name, result: toolResult }); }
          catch { /* isolate plugin errors */ }
        }
      }

      const assistantText = assistantMessageFromEvents(collectedEvents);
      const truncatedArgs = truncateToolArgs(call.name, call.args);
      options.history.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: [{
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(truncatedArgs) },
        }],
      });
      options.history.push({
        role: 'tool',
        content: toolResult.output,
        tool_call_id: call.id,
        name: call.name,
      });
    }

    turnCount++;

    // Plugin: afterTurn hook
    if (pluginManager) {
      const hooks = pluginManager.getHook('afterTurn');
      for (const hook of hooks) {
        try { await hook({ turnId, turnCount, toolCalls }); }
        catch { /* isolate plugin errors */ }
      }
    }

    options.history.push({
      role: 'system',
      content: `[Turn ${turnCount}/${config.maxTurns}] Continue the task. Use tools when appropriate. Be concise.`,
    });
  }

  cleanupTimeout();
  yield { type: 'turn_end', turnId };
}

function truncateToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if ((name === 'write_file' || name === 'edit_file') && typeof args.content === 'string' && args.content.length > 500) {
    return { ...args, content: args.content.slice(0, 200) + `\n... [${args.content.length} total chars]` };
  }
  return args;
}

async function executeTool(
  tool: Tool,
  call: ToolCall,
  signal: AbortSignal,
  maxOutputChars: number,
): Promise<ToolResult> {
  try {
    const ctx = { sessionId: 'session_1', signal };
    const outputParts: string[] = [];
    let totalChars = 0;

    for await (const event of tool.execute(call.args, ctx)) {
      if (event.type === 'tool_result' && event.result) {
        const result = event.result;
        if (typeof result.output === 'string' && result.output.length > maxOutputChars) {
          return {
            callId: call.id,
            output: result.output.slice(0, maxOutputChars) + `\n... [output truncated at ${maxOutputChars} chars]`,
            isError: result.isError,
          };
        }
        return result;
      }
      if (event.type === 'text_delta' && event.delta) {
        const remaining = maxOutputChars - totalChars;
        if (remaining <= 0) break;
        outputParts.push(event.delta.length > remaining ? event.delta.slice(0, remaining) : event.delta);
        totalChars += event.delta.length;
      }
    }

    const output = outputParts.join('');
    return {
      callId: call.id,
      output: output || 'Tool completed (no output)',
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
