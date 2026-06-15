import { describe, it, expect } from 'vitest';
import {
  RiskLevelSchema,
  ToolCallSchema,
  ToolResultSchema,
  TurnConfigSchema,
  MessageRoleSchema,
  MessageSchema,
} from './schemas.js';

describe('RiskLevelSchema', () => {
  it('accepts valid risk levels', () => {
    expect(RiskLevelSchema.parse('read')).toBe('read');
    expect(RiskLevelSchema.parse('write')).toBe('write');
    expect(RiskLevelSchema.parse('execute')).toBe('execute');
    expect(RiskLevelSchema.parse('network')).toBe('network');
  });

  it('rejects invalid risk level', () => {
    expect(() => RiskLevelSchema.parse('admin')).toThrow();
    expect(() => RiskLevelSchema.parse('')).toThrow();
    expect(() => RiskLevelSchema.parse(123)).toThrow();
  });
});

describe('ToolCallSchema', () => {
  it('accepts valid tool call', () => {
    const result = ToolCallSchema.parse({ id: 'call_1', name: 'bash', args: { command: 'ls' } });
    expect(result.id).toBe('call_1');
    expect(result.name).toBe('bash');
    expect(result.args).toEqual({ command: 'ls' });
  });

  it('accepts empty args', () => {
    const result = ToolCallSchema.parse({ id: 'call_2', name: 'read', args: {} });
    expect(result.args).toEqual({});
  });

  it('rejects missing id', () => {
    expect(() => ToolCallSchema.parse({ name: 'bash', args: {} })).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => ToolCallSchema.parse({ id: 'call_1', args: {} })).toThrow();
  });

  it('rejects null', () => {
    expect(() => ToolCallSchema.parse(null)).toThrow();
  });
});

describe('ToolResultSchema', () => {
  it('accepts valid tool result', () => {
    const result = ToolResultSchema.parse({ callId: 'call_1', output: 'hello', isError: false });
    expect(result.callId).toBe('call_1');
    expect(result.output).toBe('hello');
    expect(result.isError).toBe(false);
  });

  it('defaults isError to false', () => {
    const result = ToolResultSchema.parse({ callId: 'call_1', output: 'ok' });
    expect(result.isError).toBe(false);
  });

  it('accepts error result', () => {
    const result = ToolResultSchema.parse({ callId: 'call_1', output: 'error msg', isError: true });
    expect(result.isError).toBe(true);
  });

  it('rejects missing callId', () => {
    expect(() => ToolResultSchema.parse({ output: 'hello' })).toThrow();
  });
});

describe('TurnConfigSchema', () => {
  it('accepts valid config', () => {
    const result = TurnConfigSchema.parse({ maxTurns: 10, maxBudgetUsd: 0.5, timeoutMs: 60_000 });
    expect(result.maxTurns).toBe(10);
    expect(result.maxBudgetUsd).toBe(0.5);
    expect(result.timeoutMs).toBe(60_000);
  });

  it('applies defaults', () => {
    const result = TurnConfigSchema.parse({});
    expect(result.maxTurns).toBe(50);
    expect(result.timeoutMs).toBe(120_000);
    expect(result.maxBudgetUsd).toBeUndefined();
  });

  it('rejects non-positive maxTurns', () => {
    expect(() => TurnConfigSchema.parse({ maxTurns: 0 })).toThrow();
    expect(() => TurnConfigSchema.parse({ maxTurns: -1 })).toThrow();
  });

  it('rejects non-integer maxTurns', () => {
    expect(() => TurnConfigSchema.parse({ maxTurns: 1.5 })).toThrow();
  });

  it('rejects negative budget', () => {
    expect(() => TurnConfigSchema.parse({ maxBudgetUsd: -1 })).toThrow();
  });
});

describe('MessageRoleSchema', () => {
  it('accepts valid roles', () => {
    expect(MessageRoleSchema.parse('user')).toBe('user');
    expect(MessageRoleSchema.parse('assistant')).toBe('assistant');
    expect(MessageRoleSchema.parse('system')).toBe('system');
    expect(MessageRoleSchema.parse('tool')).toBe('tool');
  });

  it('rejects invalid role', () => {
    expect(() => MessageRoleSchema.parse('admin')).toThrow();
    expect(() => MessageRoleSchema.parse('model')).toThrow();
  });
});

describe('MessageSchema', () => {
  it('accepts valid user message', () => {
    const result = MessageSchema.parse({ role: 'user', content: 'hello' });
    expect(result.role).toBe('user');
    expect(result.content).toBe('hello');
  });

  it('accepts tool message with toolCallId and name', () => {
    const result = MessageSchema.parse({ role: 'tool', content: 'result', toolCallId: 'call_1', name: 'bash' });
    expect(result.toolCallId).toBe('call_1');
    expect(result.name).toBe('bash');
  });

  it('rejects missing content', () => {
    expect(() => MessageSchema.parse({ role: 'user' })).toThrow();
  });

  it('rejects invalid role', () => {
    expect(() => MessageSchema.parse({ role: 'invalid', content: 'hello' })).toThrow();
  });
});
