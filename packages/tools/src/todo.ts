import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Tool } from '@sentinel/shared';

const TodoReadSchema = z.object({
  action: z.literal('read'),
});

const TodoWriteSchema = z.object({
  action: z.literal('write'),
  todos: z.array(z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    priority: z.enum(['high', 'medium', 'low']),
  })),
});

const TodoSchema = z.discriminatedUnion('action', [TodoReadSchema, TodoWriteSchema]);

const TODO_FILE = '.sentinel/todo.json';

export const todoTool: Tool<typeof TodoSchema> = {
  name: 'todo',
  description: 'Read or write the structured task list. Persisted to .sentinel/todo.json.',
  risk: 'write',
  inputSchema: TodoSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    const todoPath = path.resolve(TODO_FILE);

    try {
      if (input.action === 'read') {
        let content = '[]';
        try {
          content = await fs.readFile(todoPath, 'utf-8');
        } catch {
          // file doesn't exist
        }
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: { callId: 'todo', output: content, isError: false },
        };
      } else {
        await fs.mkdir(path.dirname(todoPath), { recursive: true });
        await fs.writeFile(todoPath, JSON.stringify(input.todos, null, 2), 'utf-8');
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: { callId: 'todo', output: `Updated ${input.todos.length} tasks`, isError: false },
        };
      }
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'todo',
          output: `Error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};
