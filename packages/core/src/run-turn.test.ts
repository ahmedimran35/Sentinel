import { describe, it, expect } from 'vitest';
import type { SentinelEvent } from '@sentinel/shared';
import { z } from 'zod';
import type { Tool } from '@sentinel/shared';
import { MockProvider } from './mock-provider.js';
import { AlwaysAllowGate } from './permission-gate.js';
import { runTurn } from './run-turn.js';

function makeMockTool(name: string, risk: 'read' | 'write' | 'execute' | 'network' = 'read'): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    risk,
    inputSchema: z.object({}),
    async *execute() {
      yield {
        type: 'tool_result' as const,
        turnId: 'mock',
        result: { callId: 'call_1', output: `executed ${name}`, isError: false },
      };
    },
  };
}

function collectEvents(gen: AsyncGenerator<SentinelEvent>): Promise<SentinelEvent[]> {
  const events: SentinelEvent[] = [];
  return (async () => {
    for await (const e of gen) {
      events.push(e);
    }
    return events;
  })();
}

describe('runTurn', () => {
  it('completes a text-only turn', async () => {
    const provider = new MockProvider(new Map());

    const events = await collectEvents(
      runTurn({
        turnId: 'test-1',
        config: { maxTurns: 50, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Hello' }],
        tools: [],
        provider,
        gate: new AlwaysAllowGate(),
        signal: new AbortController().signal,
      }),
    );

    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(1);
    const textEvent = events.find((e) => e.type === 'text_delta')!;
    if (textEvent.type === 'text_delta') {
      expect(textEvent.delta).toBe('Hello from mock!');
    }
    expect(events.filter((e) => e.type === 'turn_start')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(1);
  });

  it('completes a single-tool turn with follow-up text', async () => {
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios(MockProvider.toolThenText('test-2'));

    const readFile = makeMockTool('read_file');
    const events = await collectEvents(
      runTurn({
        turnId: 'test-2',
        config: { maxTurns: 50, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Read /test.txt' }],
        tools: [readFile],
        provider,
        gate: new AlwaysAllowGate(),
        signal: new AbortController().signal,
      }),
    );

    const toolCalls = events.filter((e) => e.type === 'tool_call_start');
    expect(toolCalls).toHaveLength(1);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(1);

    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas).toHaveLength(1);
    if (textDeltas[0]?.type === 'text_delta') {
      expect(textDeltas[0].delta).toBe('Here is the file content.');
    }
  });

  it('completes a multi-tool turn', async () => {
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      MockProvider.multiTool('test-3'),
      MockProvider.textOnly('Multi-tool results processed.', 'test-3'),
    ]);

    const readFile = makeMockTool('read_file');
    const grep = makeMockTool('grep');
    const events = await collectEvents(
      runTurn({
        turnId: 'test-3',
        config: { maxTurns: 50, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Search and read' }],
        tools: [readFile, grep],
        provider,
        gate: new AlwaysAllowGate(),
        signal: new AbortController().signal,
      }),
    );

    const toolCalls = events.filter((e) => e.type === 'tool_call_start');
    expect(toolCalls).toHaveLength(2);

    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(2);
  });

  it('reports unknown tools as errors', async () => {
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      MockProvider.singleTool('test-4'),
      MockProvider.textOnly('Tool error handled.', 'test-4'),
    ]);

    const events = await collectEvents(
      runTurn({
        turnId: 'test-4',
        config: { maxTurns: 50, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Read /test.txt' }],
        tools: [],
        provider,
        gate: new AlwaysAllowGate(),
        signal: new AbortController().signal,
      }),
    );

    const errorResults = events.filter(
      (e) => e.type === 'tool_result' && e.result.isError,
    );
    expect(errorResults).toHaveLength(1);
    if (errorResults[0]?.type === 'tool_result') {
      expect(errorResults[0].result.output).toBe('Unknown tool: read_file');
    }
  });

  it('aborts cleanly mid-stream', async () => {
    const provider = new MockProvider(new Map());
    provider.registerScenario('default', [
      { delayMs: 50_000, event: { type: 'text_delta', turnId: 'test-5', delta: 'slow text' } },
    ]);

    const ac = new AbortController();

    const eventsPromise = collectEvents(
      runTurn({
        turnId: 'test-5',
        config: { maxTurns: 50, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Slow request' }],
        tools: [],
        provider,
        gate: new AlwaysAllowGate(),
        signal: ac.signal,
      }),
    );

    await sleep(10);
    ac.abort();
    const events = await eventsPromise;
    expect(events.filter((e) => e.type === 'turn_end').length).toBeGreaterThanOrEqual(1);
  });

  it('enforces maxTurns cap', async () => {
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      MockProvider.singleTool('test-6'),
      MockProvider.singleTool('test-6'),
      MockProvider.singleTool('test-6'),
      MockProvider.textOnly('Finally done.', 'test-6'),
    ]);

    const readFile = makeMockTool('read_file');
    const events = await collectEvents(
      runTurn({
        turnId: 'test-6',
        config: { maxTurns: 2, timeoutMs: 120_000 },
        systemPrompt: 'You are a helpful assistant.',
        history: [{ role: 'user', content: 'Loop' }],
        tools: [readFile],
        provider,
        gate: new AlwaysAllowGate(),
        signal: new AbortController().signal,
      }),
    );

    const totalStarts = events.filter((e) => e.type === 'turn_start').length;
    expect(totalStarts).toBe(1);

    const toolCalls = events.filter((e) => e.type === 'tool_call_start');
    expect(toolCalls.length).toBeLessThanOrEqual(2);

    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(1);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
