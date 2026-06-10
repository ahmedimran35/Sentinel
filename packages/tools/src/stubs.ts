import { z } from 'zod';
import type { Tool } from '@sentinel/shared';

export const dispatchAgentTool: Tool = {
  name: 'dispatch_agent',
  description: '[STUB] Dispatch a sub-agent to complete a task. Will be wired in Phase 6.',
  risk: 'execute',
  inputSchema: z.object({
    task: z.string(),
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
  }),
  async *execute(_input, ctx) {
    yield {
      type: 'tool_result',
      turnId: ctx.sessionId,
      result: {
        callId: 'dispatch',
        output: '[STUB] dispatch_agent not yet implemented',
        isError: false,
      },
    };
  },
};

const LspDiagnosticsSchema = z.object({
  path: z.string().optional(),
});

export const lspDiagnosticsTool: Tool<typeof LspDiagnosticsSchema> = {
  name: 'lsp_diagnostics',
  description: '[STUB] Get LSP diagnostics for the current project. Will be wired in Phase 5.',
  risk: 'read',
  inputSchema: LspDiagnosticsSchema,
  async *execute(_input, ctx) {
    yield {
      type: 'tool_result',
      turnId: ctx.sessionId,
      result: {
        callId: 'lsp',
        output: '[STUB] lsp_diagnostics not yet implemented',
        isError: false,
      },
    };
  },
};
