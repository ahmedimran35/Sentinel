import type { z } from 'zod';
import type {
  ToolCallSchema,
  ToolResultSchema,
  TurnConfigSchema,
} from './schemas.js';

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type TurnConfig = z.infer<typeof TurnConfigSchema>;

export type SentinelEvent =
  | { type: 'turn_start'; turnId: string; config: TurnConfig }
  | { type: 'text_delta'; turnId: string; delta: string }
  | { type: 'tool_call_start'; turnId: string; call: ToolCall }
  | { type: 'tool_call_args_delta'; turnId: string; callId: string; delta: string }
  | { type: 'tool_result'; turnId: string; result: ToolResult }
  | { type: 'turn_end'; turnId: string }
  | { type: 'compact_boundary'; reason: string }
  | { type: 'error'; turnId: string; message: string; fatal: boolean }
  | { type: 'awaiting_permission'; turnId: string; action: string; risk: string };
