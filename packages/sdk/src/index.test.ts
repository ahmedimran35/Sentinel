import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunTurn = vi.fn();
const mockAlwaysAllowGate = vi.fn();
const mockConfiguredGate = vi.fn();
const mockCreateProvider = vi.fn();

vi.mock('@sentinel/core', () => ({
  runTurn: mockRunTurn,
  AlwaysAllowGate: mockAlwaysAllowGate,
  ConfiguredGate: mockConfiguredGate,
  createProvider: mockCreateProvider,
}));

const { runAgent } = await import('./index.js');

async function* makeStream(events: any[], onEvent?: (e: any) => void) {
  for (const e of events) {
    onEvent?.(e);
    yield e;
  }
}

describe('runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completed status on success', async () => {
    mockRunTurn.mockReturnValue(makeStream([
      { type: 'text_delta', turnId: 't1', delta: 'Hello' },
      { type: 'text_delta', turnId: 't1', delta: ' world' },
      { type: 'turn_end', turnId: 't1' },
    ]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    const result = await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514' });

    expect(result.status).toBe('completed');
    expect(result.messages).toEqual(['Hello', ' world']);
  });

  it('returns error status on fatal error', async () => {
    mockRunTurn.mockReturnValue(makeStream([
      { type: 'error', turnId: 't1', message: 'Something broke', fatal: true },
    ]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    const result = await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514' });

    expect(result.status).toBe('error');
  });

  it('creates AlwaysAllowGate when no mode specified', async () => {
    mockRunTurn.mockReturnValue(makeStream([{ type: 'turn_end', turnId: 't1' }]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514' });

    expect(mockAlwaysAllowGate).toHaveBeenCalledOnce();
  });

  it('creates ConfiguredGate with mode when specified', async () => {
    mockRunTurn.mockReturnValue(makeStream([{ type: 'turn_end', turnId: 't1' }]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514', mode: 'plan' });

    expect(mockConfiguredGate).toHaveBeenCalledOnce();
    expect(mockAlwaysAllowGate).not.toHaveBeenCalled();
  });

  it('calls onEvent callback when provided', async () => {
    const onEvent = vi.fn();
    mockRunTurn.mockImplementation((opts: any) => makeStream([
      { type: 'text_delta', turnId: 't1', delta: 'Hi' },
      { type: 'turn_end', turnId: 't1' },
    ], opts.onEvent));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }, { onEvent });

    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('uses custom systemPrompt', async () => {
    mockRunTurn.mockReturnValue(makeStream([{ type: 'turn_end', turnId: 't1' }]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    const customPrompt = 'You are a test bot.';
    await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: customPrompt });

    const callArg = mockRunTurn.mock.calls[0][0];
    expect(callArg.systemPrompt).toBe(customPrompt);
  });

  it('passes maxTurns config', async () => {
    mockRunTurn.mockReturnValue(makeStream([{ type: 'turn_end', turnId: 't1' }]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    await runAgent('hello', { provider: 'anthropic', model: 'claude-sonnet-4-20250514', maxTurns: 5 });

    const callArg = mockRunTurn.mock.calls[0][0];
    expect(callArg.config.maxTurns).toBe(5);
  });

  it('creates provider with correct name and model', async () => {
    mockRunTurn.mockReturnValue(makeStream([{ type: 'turn_end', turnId: 't1' }]));
    mockCreateProvider.mockResolvedValue({ name: 'test-provider' });

    await runAgent('hello', { provider: 'openai', model: 'gpt-4' });

    expect(mockCreateProvider).toHaveBeenCalledWith('openai', 'gpt-4');
  });
});
