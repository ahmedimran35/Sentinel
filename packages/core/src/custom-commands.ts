import type { SentinelConfig } from './config-schema.js';
import type { CommandRegistry } from './commands/registry.js';
import type { CommandContext } from './commands/types.js';

export interface CustomCommandDef {
  name: string;
  description: string;
  template: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
}

export function loadCustomCommandsFromConfig(
  config: SentinelConfig,
  registry?: CommandRegistry,
): CustomCommandDef[] {
  const commands: CustomCommandDef[] = [];
  const raw = (config as Record<string, unknown>).command as Record<string, unknown> | undefined;
  if (!raw) return commands;

  for (const [name, entry] of Object.entries(raw)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const def: CustomCommandDef = {
      name,
      description: String(e.description || ''),
      template: String(e.template || ''),
      agent: e.agent ? String(e.agent) : undefined,
      model: e.model ? String(e.model) : undefined,
      subtask: e.subtask === true,
    };
    commands.push(def);
  }

  // Register with the command registry if provided
  if (registry) {
    for (const cmd of commands) {
      registry.register({
        name: cmd.name,
        summary: cmd.description,
        usage: cmd.name,
        kind: 'custom' as const,
        source: 'config' as const,
        category: 'custom' as const,
        run: async (ctx: CommandContext, _rawArgs: string) => {
          const resolved = resolveTemplate(cmd.template, []);
          ctx.log?.(resolved);
        },
      });
    }
  }

  return commands;
}

function resolveTemplate(template: string, args: string[]): string {
  let result = template;

  // $1, $2, $3... positional args
  for (let i = 0; i < args.length; i++) {
    result = result.replace(new RegExp(`\\$${i + 1}`, 'g'), args[i]!);
  }

  // $ARGUMENTS - all args joined
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // $ARGUMENTS_QUOTED - all args joined and quoted
  result = result.replace(/\$ARGUMENTS_QUOTED/g, args.map(a => `"${a}"`).join(' '));

  return result;
}
