import type { SentinelEvent } from '@sentinel/shared';

type Listener = (event: SentinelEvent) => void;

export class EventBus {
  private listeners: Map<SentinelEvent['type'], Set<Listener>> = new Map();
  private anyListeners: Set<Listener> = new Set();
  private history: SentinelEvent[] = [];

  on(type: SentinelEvent['type'] | '*', listener: Listener): () => void {
    if (type === '*') {
      this.anyListeners.add(listener);
      return () => this.anyListeners.delete(listener);
    }
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)!.delete(listener);
  }

  emit(event: SentinelEvent): void {
    this.history.push(event);
    this.listeners.get(event.type)?.forEach((l) => l(event));
    this.anyListeners.forEach((l) => l(event));
  }

  getHistory(): readonly SentinelEvent[] {
    return this.history;
  }

  clear(): void {
    this.history = [];
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
