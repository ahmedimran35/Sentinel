import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('emits and receives typed events', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('text_delta', listener);
    bus.emit({ type: 'text_delta', turnId: 't1', delta: 'hello' });

    expect(listener).toHaveBeenCalledWith({
      type: 'text_delta',
      turnId: 't1',
      delta: 'hello',
    });
  });

  it('supports wildcard listener', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('*', listener);
    bus.emit({ type: 'turn_start', turnId: 't1', config: { maxTurns: 50, timeoutMs: 120_000 } });
    bus.emit({ type: 'turn_end', turnId: 't1' });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns unsubscribe function', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const unsub = bus.on('text_delta', listener);
    unsub();
    bus.emit({ type: 'text_delta', turnId: 't1', delta: 'hello' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('maintains event history', () => {
    const bus = new EventBus();
    bus.emit({ type: 'turn_start', turnId: 't1', config: { maxTurns: 50, timeoutMs: 120_000 } });
    bus.emit({ type: 'text_delta', turnId: 't1', delta: 'a' });
    bus.emit({ type: 'turn_end', turnId: 't1' });

    expect(bus.getHistory()).toHaveLength(3);
    expect(bus.getHistory()[1]).toEqual({
      type: 'text_delta',
      turnId: 't1',
      delta: 'a',
    });
  });

  it('clears all state', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on('text_delta', listener);
    bus.emit({ type: 'text_delta', turnId: 't1', delta: 'a' });
    bus.clear();

    expect(bus.getHistory()).toHaveLength(0);

    bus.emit({ type: 'text_delta', turnId: 't1', delta: 'b' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
