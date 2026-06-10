import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { PermissionGate } from '@sentinel/core';

export type { SentinelEvent, Tool, TurnConfig, PermissionGate };
export type { RunTurnOptions } from '@sentinel/core';

export type RunResult = {
  status: 'completed' | 'interrupted' | 'error';
  turnsUsed: number;
  totalCostUsd: number;
  messages: string[];
};

export type AgentConfig = {
  provider: string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  mode?: 'plan' | 'build' | 'auto' | 'yolo';
};

export type RunCallbacks = {
  onEvent?: (event: SentinelEvent) => void;
  onPermissionRequest?: (action: string, risk: string) => Promise<'y' | 'n'>;
};

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function runAgent(
  input: string,
  config: AgentConfig,
  callbacks?: RunCallbacks,
): Promise<RunResult> {
  const { runTurn } = await import('@sentinel/core');
  const { AlwaysAllowGate, ConfiguredGate } = await import('@sentinel/core');

  const turnId = generateId();
  const cancel = new AbortController();
  const messages: string[] = [];

  const gate = config.mode
    ? (new ConfiguredGate({ mode: config.mode, rules: { allow: [], deny: [] }, projectRoot: process.cwd(), allowOutsideRoot: false }, () => {}) as unknown as PermissionGate)
    : new AlwaysAllowGate();

  const stream = runTurn({
    turnId,
    config: {
      maxTurns: config.maxTurns ?? 50,
      maxBudgetUsd: config.maxBudgetUsd,
      timeoutMs: config.timeoutMs ?? 120_000,
    },
    systemPrompt: config.systemPrompt ?? 'You are Sentinel, an AI coding assistant.',
    history: [{ role: 'user', content: input }],
    tools: [],
    provider: null as never,
    gate,
    signal: cancel.signal,
    onEvent: callbacks?.onEvent,
  });

  for await (const event of stream) {
    if (event.type === 'text_delta') {
      messages.push(event.delta);
    }
    if (event.type === 'error' && event.fatal) {
      return { status: 'error', turnsUsed: 0, totalCostUsd: 0, messages };
    }
  }

  return { status: 'completed', turnsUsed: 1, totalCostUsd: 0, messages };
}
