import type { SentinelEvent } from '@sentinel/shared';

export function anthropicTextOnlyFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Hello! I can help you with that.' },
    { type: 'turn_end', turnId },
  ];
}

export function anthropicToolCallFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Let me check that file.' },
    {
      type: 'tool_call_start',
      turnId,
      call: { id: 'toolu_abc123', name: 'read_file', args: { path: '/test.txt' } },
    },
    { type: 'tool_call_args_delta', turnId, callId: 'toolu_abc123', delta: '' },
    { type: 'turn_end', turnId },
  ];
}

export function openAITextOnlyFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Sure, here is the answer.' },
    { type: 'turn_end', turnId },
  ];
}

export function openAIToolCallFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'I will look this up.' },
    {
      type: 'tool_call_start',
      turnId,
      call: { id: 'call_xyz789', name: 'grep', args: { pattern: 'TODO', path: 'src/' } },
    },
    { type: 'turn_end', turnId },
  ];
}

export function geminiTextOnlyFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Here is the information you requested.' },
    { type: 'turn_end', turnId },
  ];
}

export function geminiFunctionCallFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Let me query that.' },
    {
      type: 'tool_call_start',
      turnId,
      call: { id: 'fc_readFile', name: 'readFile', args: { path: 'config.json' } },
    },
    { type: 'turn_end', turnId },
  ];
}

export function multiToolFixture(turnId = 'test'): SentinelEvent[] {
  return [
    { type: 'text_delta', turnId, delta: 'Running multiple searches.' },
    {
      type: 'tool_call_start',
      turnId,
      call: { id: 'call_1', name: 'grep', args: { pattern: 'class' } },
    },
    {
      type: 'tool_call_start',
      turnId,
      call: { id: 'call_2', name: 'glob', args: { pattern: '*.ts' } },
    },
    { type: 'turn_end', turnId },
  ];
}
