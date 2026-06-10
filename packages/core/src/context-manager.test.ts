import { describe, it, expect } from 'vitest';
import { ContextManager } from './context-manager.js';

function mockCountTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe('ContextManager', () => {
  it('tracks token usage', () => {
    const cm = new ContextManager(1000, mockCountTokens);
    cm.addMessage('user', 'hello world');
    const usage = cm.getUsage();
    expect(usage.used).toBeGreaterThan(0);
    expect(usage.ratio).toBeLessThan(1);
  });

  it('reports shouldCompact when above threshold', () => {
    const cm = new ContextManager(10, mockCountTokens, 0.8);
    cm.addMessage('user', 'x'.repeat(50));
    expect(cm.shouldCompact()).toBe(true);
  });

  it('compacts old tool results', () => {
    const cm = new ContextManager(1000, mockCountTokens, 0.5);
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
    const cm = new ContextManager(1000, mockCountTokens);
    cm.addMessage('user', 'hi');
    const result = cm.compact();
    expect(result.pruned).toBe(0);
  });

  it('clears all state', () => {
    const cm = new ContextManager(1000, mockCountTokens);
    cm.addMessage('user', 'hello');
    cm.clear();
    expect(cm.getUsage().used).toBe(0);
    expect(cm.getMessages()).toHaveLength(0);
  });
});
