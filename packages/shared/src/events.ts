import type { z } from 'zod';
import type {
  ToolCallSchema,
  ToolResultSchema,
  TurnConfigSchema,
} from './schemas.js';

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type TurnConfig = z.infer<typeof TurnConfigSchema>;

export type AgentEvent =
  | { type: 'agent_start'; agentId: string; task: string; model: string }
  | { type: 'agent_progress'; agentId: string; message: string; progress: number }
  | { type: 'agent_result'; agentId: string; output: string; success: boolean }
  | { type: 'agent_error'; agentId: string; message: string };

export type SentinelEvent =
  | { type: 'turn_start'; turnId: string; config: TurnConfig }
  | { type: 'text_delta'; turnId: string; delta: string }
  | { type: 'tool_call_start'; turnId: string; call: ToolCall }
  | { type: 'tool_call_args_delta'; turnId: string; callId: string; delta: string }
  | { type: 'tool_result'; turnId: string; result: ToolResult }
  | { type: 'turn_end'; turnId: string; usage?: { input: number; output: number; cache_read?: number } }
  | { type: 'compact_boundary'; reason: string }
  | { type: 'error'; turnId: string; message: string; fatal: boolean }
  | { type: 'awaiting_permission'; turnId: string; action: string; risk: string }
  | { type: 'permission_response'; turnId: string; response: 'approved' | 'denied' }
  | AgentEvent;
