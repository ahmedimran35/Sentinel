import fs from 'node:fs';
import type { SlashCommand, ParsedArgs } from './types.js';
import { parseArgs } from './types.js';

const LOG_FILE = '/tmp/sentinel.log';

function warn(msg: string): void {
  try {
    fs.appendFileSync(LOG_FILE, `[registry] ${msg}\n`);
  } catch { /* ignore */ }
}

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();
  private aliasMap = new Map<string, string>();

  register(cmd: SlashCommand): void {
    const existing = this.commands.get(cmd.name);
    if (existing) {
      if (cmd.source === 'core' && existing.source !== 'core') {
        warn(`override: ${cmd.name} (${existing.source} → core)`);
        this.commands.set(cmd.name, cmd);
      } else if (cmd.source !== 'core' && existing.source !== cmd.source) {
        warn(`override: ${cmd.name} (${existing.source} → ${cmd.source})`);
        this.commands.set(cmd.name, cmd);
      } else {
        warn(`re-register: ${cmd.name} (${cmd.source})`);
        this.commands.set(cmd.name, cmd);
      }
    } else {
      this.commands.set(cmd.name, cmd);
    }

    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.aliasMap.set(alias.replace(/^\//, ''), cmd.name);
      }
    }
  }

  resolve(line: string): { cmd: SlashCommand; rawArgs: string } | null {
    const trimmed = line.startsWith('/') ? line.slice(1) : line;
    const spaceIdx = trimmed.indexOf(' ');
    const namePart = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed;
    const rawArgs = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1) : '';

    const resolvedName = this.aliasMap.get(namePart) ?? namePart;
    const cmd = this.commands.get(resolvedName);
    if (!cmd) return null;

    return { cmd, rawArgs };
  }

  all(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  byCategory(): Record<string, SlashCommand[]> {
    const groups: Record<string, SlashCommand[]> = {};
    for (const cmd of this.commands.values()) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category]!.push(cmd);
    }
    return groups;
  }

  get(name: string): SlashCommand | undefined {
    const resolved = this.aliasMap.get(name) ?? name;
    return this.commands.get(resolved);
  }

  remove(name: string): boolean {
    const cmd = this.commands.get(name);
    if (cmd?.aliases) {
      for (const a of cmd.aliases) this.aliasMap.delete(a.replace(/^\//, ''));
    }
    return this.commands.delete(name);
  }

  static parseArgs(raw: string): ParsedArgs {
    return parseArgs(raw);
  }
}
