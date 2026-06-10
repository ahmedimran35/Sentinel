import { z } from 'zod';

export const RiskLevelSchema = z.enum(['read', 'write', 'execute', 'network']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  callId: z.string(),
  output: z.string(),
  isError: z.boolean().default(false),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const TurnConfigSchema = z.object({
  maxTurns: z.number().int().positive().default(50),
  maxBudgetUsd: z.number().positive().optional(),
  timeoutMs: z.number().int().positive().default(120_000),
});
export type TurnConfig = z.infer<typeof TurnConfigSchema>;

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  toolCallId: z.string().optional(),
  name: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;
