import { describe, it, expect } from 'vitest';
import { ContextManager, createDefaultCompactionPolicy } from './context-manager.js';
import type { CompactionPolicy } from './context-manager.js';

function mockCountTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const defaultPolicy = createDefaultCompactionPolicy();

describe('ContextManager', () => {
  it('tracks token usage', () => {
    const cm = new ContextManager(1000, mockCountTokens, 0.9, defaultPolicy);
    cm.addMessage('user', 'hello world');
    const usage = cm.getUsage();
    expect(usage.used).toBeGreaterThan(0);
    expect(usage.ratio).toBeLessThan(1);
  });

  it('reports shouldCompact when above threshold', () => {
    const cm = new ContextManager(10, mockCountTokens, 0.8, defaultPolicy);
    cm.addMessage('user', 'x'.repeat(50));
    expect(cm.shouldCompact()).toBe(true);
  });

  it('reports shouldCompact false when auto is disabled', () => {
    const policy: CompactionPolicy = { auto: false, prune: true, reserved: 0 };
    const cm = new ContextManager(10, mockCountTokens, 0.8, policy);
    cm.addMessage('user', 'x'.repeat(50));
    expect(cm.shouldCompact()).toBe(false);
  });

  it('compacts old tool results', () => {
    const cm = new ContextManager(1000, mockCountTokens, 0.5, defaultPolicy);
    cm.addMessage('system', 'system prompt');
    cm.addMessage('user', 'do something');

    for (let i = 0; i < 10; i++) {
      cm.addMessage('assistant', `thought ${i}`);
      cm.addMessage('tool', `result ${i}`);
    }

    const result = cm.compact();
    expect(result.pruned).toBeGreaterThan(0);
    expect(result.kept).toBeGreaterThan(0);
    expect(cm.getUsage().used).toBeLessThan(1000);
  });

  it('returns early for small contexts', () => {
    const cm = new ContextManager(1000, mockCountTokens, 0.9, defaultPolicy);
    cm.addMessage('user', 'hi');
    const result = cm.compact();
    expect(result.pruned).toBe(0);
  });

  it('clears all state', () => {
    const cm = new ContextManager(1000, mockCountTokens, 0.9, defaultPolicy);
    cm.addMessage('user', 'hello');
    cm.clear();
    expect(cm.getUsage().used).toBe(0);
    expect(cm.getMessages()).toHaveLength(0);
  });

  it('skips pruning when prune is disabled', () => {
    const policy: CompactionPolicy = { auto: true, prune: false, reserved: 0 };
    const cm = new ContextManager(1000, mockCountTokens, 0.5, policy);
    cm.addMessage('system', 'system prompt');
    cm.addMessage('user', 'do something');
    for (let i = 0; i < 10; i++) {
      cm.addMessage('assistant', `thought ${i}`);
      cm.addMessage('tool', `result ${i}`);
    }
    const result = cm.compact();
    expect(result.pruned).toBe(0);
    expect(result.kept).toBeGreaterThan(0);
  });

  it('preserves reserved tokens for system messages', () => {
    const policy: CompactionPolicy = { auto: true, prune: true, reserved: 500 };
    const cm = new ContextManager(2000, mockCountTokens, 0.8, policy);
    cm.addMessage('system', 'x'.repeat(2000));
    cm.addMessage('user', 'do something');
    for (let i = 0; i < 8; i++) {
      cm.addMessage('assistant', `thought ${i}`);
      cm.addMessage('tool', `result ${i}`);
    }
    const result = cm.compact();
    expect(result.pruned).toBeGreaterThan(0);
    expect(result.kept).toBeGreaterThan(0);
    const after = cm.getUsage();
    expect(after.used).toBeGreaterThan(0);
    expect(after.used).toBeLessThan(2000);
  });

  it('createDefaultCompactionPolicy returns expected defaults', () => {
    const p = createDefaultCompactionPolicy();
    expect(p.auto).toBe(true);
    expect(p.prune).toBe(true);
    expect(p.reserved).toBe(0);
  });
});
