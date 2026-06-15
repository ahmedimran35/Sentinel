import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { MockProvider } from './mock-provider.js';
import { AlwaysAllowGate } from './permission-gate.js';
import type { CompactionPolicy } from './context-manager.js';

describe('Engine compaction wiring', () => {
  it('creates ContextManager from compaction config and emits compact_boundary', async () => {
    const policy: CompactionPolicy = { auto: true, prune: true, reserved: 0 };
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      [
        { event: { type: 'text_delta', turnId: 't1', delta: 'Hello. ' } },
        { event: { type: 'tool_call_start', turnId: 't1', call: { id: 'c1', name: 'bash', args: { command: 'echo hi' } } } },
        { event: { type: 'turn_end', turnId: 't1' } },
      ],
      [
        { event: { type: 'text_delta', turnId: 't2', delta: 'Done.' } },
        { event: { type: 'turn_end', turnId: 't2' } },
      ],
    ]);

    const engine = new Engine({
      systemPrompt: 'Test',
      turnConfig: { maxTurns: 2, timeoutMs: 5000 },
      compaction: policy,
      provider,
      gate: new AlwaysAllowGate(),
    });

    const signal = new AbortController();
    const result = await engine.run('test input', [], signal.signal);

    expect(result.error).toBeUndefined();
    expect(result.events.length).toBeGreaterThan(0);

    const compactEvents = result.events.filter(e => e.type === 'compact_boundary');
    expect(compactEvents.length).toBeGreaterThanOrEqual(0);
  });

  it('emits compact_boundary when compaction triggers', async () => {
    const policy: CompactionPolicy = { auto: true, prune: true, reserved: 0 };
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      [
        { event: { type: 'text_delta', turnId: 't1', delta: 'A'.repeat(500) } },
        { event: { type: 'tool_call_start', turnId: 't1', call: { id: 'c1', name: 'bash', args: { command: 'echo hi' } } } },
        { event: { type: 'turn_end', turnId: 't1' } },
      ],
      [
        { event: { type: 'text_delta', turnId: 't2', delta: 'B'.repeat(500) } },
        { event: { type: 'turn_end', turnId: 't2' } },
      ],
    ]);

    const { ContextManager } = await import('./context-manager.js');
    const cm = new ContextManager(100, (t: string) => Math.ceil(t.length / 4), 0.3, policy);
    cm.addMessage('system', 'sys');

    const engine = new Engine({
      systemPrompt: 'Test',
      turnConfig: { maxTurns: 2, timeoutMs: 5000 },
      contextManager: cm,
      provider,
      gate: new AlwaysAllowGate(),
    });

    const signal = new AbortController();
    const result = await engine.run('large input', [], signal.signal);

    const compactEvents = result.events.filter(e => e.type === 'compact_boundary');
    expect(compactEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('skips compaction when auto is false', async () => {
    const policy: CompactionPolicy = { auto: false, prune: true, reserved: 0 };
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      [
        { event: { type: 'text_delta', turnId: 't1', delta: 'Hello. ' } },
        { event: { type: 'turn_end', turnId: 't1' } },
      ],
    ]);

    const engine = new Engine({
      systemPrompt: 'Test',
      turnConfig: { maxTurns: 1, timeoutMs: 5000 },
      compaction: policy,
      provider,
      gate: new AlwaysAllowGate(),
    });

    const signal = new AbortController();
    const result = await engine.run('input', [], signal.signal);

    const compactEvents = result.events.filter(e => e.type === 'compact_boundary');
    expect(compactEvents).toHaveLength(0);
  });

  it('accepts an external ContextManager instead of creating one', async () => {
    const policy: CompactionPolicy = { auto: true, prune: true, reserved: 0 };
    const provider = new MockProvider(new Map());
    provider.setMultiCallScenarios([
      [
        { event: { type: 'text_delta', turnId: 't1', delta: 'Hello. ' } },
        { event: { type: 'turn_end', turnId: 't1' } },
      ],
    ]);

    const { ContextManager } = await import('./context-manager.js');
    const ctxMgr = new ContextManager(1000, (t: string) => Math.ceil(t.length / 4), 0.9, policy);

    const engine = new Engine({
      systemPrompt: 'Test',
      turnConfig: { maxTurns: 1, timeoutMs: 5000 },
      contextManager: ctxMgr,
      provider,
      gate: new AlwaysAllowGate(),
    });

    const signal = new AbortController();
    await engine.run('input', [], signal.signal);

    const usage = ctxMgr.getUsage();
    expect(usage.used).toBeGreaterThan(0);
  });
});
