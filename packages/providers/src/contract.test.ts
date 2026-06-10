import { describe, it, expect } from 'vitest';
import { ProviderRouter } from './router.js';
import {
  anthropicTextOnlyFixture,
  anthropicToolCallFixture,
  openAITextOnlyFixture,
  openAIToolCallFixture,
  geminiTextOnlyFixture,
  geminiFunctionCallFixture,
  multiToolFixture,
} from './fixtures.js';
import type { Provider, ProviderMessage } from './types.js';
import type { SentinelEvent, Tool, TurnConfig } from '@sentinel/shared';
class TestProvider implements Provider {
  costPer1kTokens = { input: 0, output: 0 };
  constructor(private events: SentinelEvent[]) {}
  async *streamChat(
    _messages: ProviderMessage[],
    _tools: Tool[],
    _config: TurnConfig,
    _signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    for (const e of this.events) yield e;
  }
  countTokens(t: string): number { return Math.ceil(t.length / 4); }
}

function collect(iterable: AsyncIterable<SentinelEvent>): Promise<SentinelEvent[]> {
  const events: SentinelEvent[] = [];
  return (async () => { for await (const e of iterable) events.push(e); return events; })();
}


describe('Provider contract tests', () => {
  describe('Text-only turns', () => {
    it('Anthropic fixture produces text deltas', async () => {
      const p = new TestProvider(anthropicTextOnlyFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'text_delta')).toHaveLength(1);
      expect(events.filter(e => e.type === 'turn_end')).toHaveLength(1);
    });

    it('OpenAI fixture produces text deltas', async () => {
      const p = new TestProvider(openAITextOnlyFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'text_delta')).toHaveLength(1);
    });

    it('Gemini fixture produces text deltas', async () => {
      const p = new TestProvider(geminiTextOnlyFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'text_delta')).toHaveLength(1);
    });
  });

  describe('Tool call turns', () => {
    it('Anthropic fixture produces tool calls', async () => {
      const p = new TestProvider(anthropicToolCallFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'tool_call_start')).toHaveLength(1);
    });

    it('OpenAI fixture produces tool calls', async () => {
      const p = new TestProvider(openAIToolCallFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'tool_call_start')).toHaveLength(1);
    });

    it('Gemini fixture produces function calls', async () => {
      const p = new TestProvider(geminiFunctionCallFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'tool_call_start')).toHaveLength(1);
    });

    it('Multi-tool fixture produces multiple tool calls', async () => {
      const p = new TestProvider(multiToolFixture());
      const events = await collect(p.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events.filter(e => e.type === 'tool_call_start')).toHaveLength(2);
    });
  });

  describe('Mid-session model switch', () => {
    it('switching model preserves message history', async () => {
      const history: ProviderMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const p1 = new TestProvider([{ type: 'text_delta', turnId: 't1', delta: 'Hi!' }, { type: 'turn_end', turnId: 't1' }]);
      const p2 = new TestProvider([{ type: 'text_delta', turnId: 't2', delta: 'How can I help?' }, { type: 'turn_end', turnId: 't2' }]);

      const router = new ProviderRouter(p1, 'model-a', { maxTurns: 50, timeoutMs: 120_000 });

      const events1 = await collect(router.streamChat(history, [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events1.filter(e => e.type === 'text_delta' && e.delta === 'Hi!')).toHaveLength(1);

      history.push({ role: 'assistant', content: 'Hi!' });

      router.switchModel('model-b', p2);

      const events2 = await collect(router.streamChat(history, [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal));
      expect(events2.filter(e => e.type === 'text_delta' && e.delta === 'How can I help?')).toHaveLength(1);

      expect(router.getCurrentModel()).toBe('model-b');
    });
  });

  describe('Per-role routing', () => {
    it('routes to different providers per role', async () => {
      const mainP = new TestProvider([{ type: 'text_delta', turnId: 'main', delta: 'main response' }, { type: 'turn_end', turnId: 'main' }]);
      const planP = new TestProvider([{ type: 'text_delta', turnId: 'plan', delta: 'plan response' }, { type: 'turn_end', turnId: 'plan' }]);

      const router = new ProviderRouter(mainP, 'main-model', { maxTurns: 50, timeoutMs: 120_000 });
      router.setRoute({ role: 'plan', provider: planP, config: { maxTurns: 10, timeoutMs: 60_000 } });

      const mainEvents = await collect(router.streamChat([], [], { maxTurns: 50, timeoutMs: 120_000 }, new AbortController().signal, 'main'));
      expect(mainEvents.filter(e => e.type === 'text_delta' && e.delta === 'main response')).toHaveLength(1);

      const planEvents = await collect(router.streamChat([], [], { maxTurns: 10, timeoutMs: 60_000 }, new AbortController().signal, 'plan'));
      expect(planEvents.filter(e => e.type === 'text_delta' && e.delta === 'plan response')).toHaveLength(1);
    });
  });
});
