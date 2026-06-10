import type { z } from 'zod';

export interface Tool<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  risk: 'read' | 'write' | 'execute' | 'network';
  inputSchema: TInput;
  execute(
    input: z.infer<TInput>,
    ctx: { sessionId: string; signal: AbortSignal },
  ): AsyncIterable<{ type: string; turnId: string; result?: { callId: string; output: string; isError: boolean }; delta?: string }>;
}
