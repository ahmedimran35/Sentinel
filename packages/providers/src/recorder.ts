import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from './types.js';

export interface RecordedStream {
  events: SentinelEvent[];
}

export class RecordingProvider implements Provider {
  costPer1kTokens = { input: 0, output: 0 };
  private recordings: RecordedStream[] = [];

  constructor(private inner: Provider) {}

  async *streamChat(
    messages: ProviderMessage[],
    tools: Tool[],
    config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const events: SentinelEvent[] = [];

    for await (const event of this.inner.streamChat(messages, tools, config, signal)) {
      events.push(event);
      yield event;
    }

    this.recordings.push({ events });
  }

  countTokens(text: string): number {
    return this.inner.countTokens(text);
  }

  getRecordings(): readonly RecordedStream[] {
    return this.recordings;
  }

  clearRecordings(): void {
    this.recordings = [];
  }
}

export class ReplayProvider implements Provider {
  costPer1kTokens = { input: 0, output: 0 };
  private callIndex = 0;

  constructor(private recordings: RecordedStream[]) {}

  async *streamChat(
    _messages: ProviderMessage[],
    _tools: Tool[],
    _config: TurnConfig,
    _signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const idx = this.callIndex;
    this.callIndex++;
    const recording = this.recordings[idx % this.recordings.length];
    if (!recording) return;

    for (const event of recording.events) {
      yield event;
    }
  }

  countTokens(_text: string): number {
    return 0;
  }
}
