import type { SentinelEvent, TurnConfig } from '@sentinel/shared';
import type { Provider, ProviderMessage } from '@sentinel/providers';
import type { Tool } from '@sentinel/shared';

export interface ScriptedEvent {
  delayMs?: number;
  event: SentinelEvent;
}

export class MockProvider implements Provider {
  costPer1kTokens = { input: 0, output: 0 };
  private callCount = 0;

  constructor(
    private scenarios: Map<string, ScriptedEvent[]>,
    private defaultScenario: ScriptedEvent[] = [
      { event: { type: 'text_delta', turnId: 'mock', delta: 'Hello from mock!' } },
      { event: { type: 'turn_end', turnId: 'mock' } },
    ],
    private multiCallScenarios: ScriptedEvent[][] = [],
  ) {}

  async *streamChat(
    _messages: ProviderMessage[],
    _tools: Tool[],
    _config: TurnConfig,
    signal: AbortSignal,
  ): AsyncIterable<SentinelEvent> {
    const idx = this.callCount;
    this.callCount++;

    let events: ScriptedEvent[];
    if (idx < this.multiCallScenarios.length) {
      events = this.multiCallScenarios[idx]!;
    } else {
      events = this.scenarios.get('default') ?? this.defaultScenario;
    }

    for (const step of events) {
      if (signal.aborted) {
        yield { type: 'turn_end', turnId: 'mock' };
        return;
      }
      if (step.delayMs && step.delayMs > 0) {
        await sleep(step.delayMs, signal);
        if (signal.aborted) {
          yield { type: 'turn_end', turnId: 'mock' };
          return;
        }
      }
      yield step.event;
    }
  }

  countTokens(_text: string): number {
    return 0;
  }

  registerScenario(key: string, events: ScriptedEvent[]): void {
    this.scenarios.set(key, events);
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  setMultiCallScenarios(scenarios: ScriptedEvent[][]): void {
    this.multiCallScenarios = scenarios;
  }

  static textOnly(text: string, turnId = 'mock'): ScriptedEvent[] {
    return [
      { event: { type: 'text_delta', turnId, delta: text } },
      { event: { type: 'turn_end', turnId } },
    ];
  }

  static singleTool(turnId = 'mock'): ScriptedEvent[] {
    return [
      {
        event: {
          type: 'tool_call_start',
          turnId,
          call: { id: 'call_1', name: 'read_file', args: { path: '/test.txt' } },
        },
      },
      {
        event: {
          type: 'tool_call_args_delta',
          turnId,
          callId: 'call_1',
          delta: '',
        },
      },
      { event: { type: 'turn_end', turnId } },
    ];
  }

  static toolThenText(turnId = 'mock'): ScriptedEvent[][] {
    return [
      [
        {
          event: {
            type: 'tool_call_start',
            turnId,
            call: { id: 'call_1', name: 'read_file', args: { path: '/test.txt' } },
          },
        },
        { event: { type: 'turn_end', turnId } },
      ],
      [
        { event: { type: 'text_delta', turnId, delta: 'Here is the file content.' } },
        { event: { type: 'turn_end', turnId } },
      ],
    ];
  }

  static multiTool(turnId = 'mock'): ScriptedEvent[] {
    return [
      {
        event: {
          type: 'tool_call_start',
          turnId,
          call: { id: 'call_1', name: 'read_file', args: { path: '/a.txt' } },
        },
      },
      {
        event: {
          type: 'tool_call_start',
          turnId,
          call: { id: 'call_2', name: 'grep', args: { pattern: 'foo' } },
        },
      },
      { event: { type: 'turn_end', turnId } },
    ];
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal.aborted) {
      clearTimeout(id);
      resolve();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
