import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './registry.js';
import { groupACommands, groupBCommands, groupCCommands, groupDCommands, groupECommands, groupFCommands, groupGCommands } from './index.js';

describe('all commands resolve correctly', () => {
  const reg = new CommandRegistry();
  for (const cmd of groupACommands) reg.register(cmd);
  for (const cmd of groupBCommands) reg.register(cmd);
  for (const cmd of groupCCommands) reg.register(cmd);
  for (const cmd of groupDCommands) reg.register(cmd);
  for (const cmd of groupECommands) reg.register(cmd);
  for (const cmd of groupFCommands) reg.register(cmd);
  for (const cmd of groupGCommands) reg.register(cmd);

  const all = reg.all();
  it('has at least 30 commands', () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  const resolveCases: Array<[string, string, string]> = [];
  for (const cmd of all) {
    resolveCases.push([`/${cmd.name}`, cmd.name, '']);
    if (cmd.aliases) {
      for (const a of cmd.aliases) {
        resolveCases.push([`/${a}`, cmd.name, '']);
      }
    }
  }

  it.each(resolveCases)('resolves %s → %s', (line, expectedName) => {
    const result = reg.resolve(line);
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe(expectedName);
  });

  it('resolves with arguments', () => {
    const r = reg.resolve('/model nim/stepfun-ai/step-3.7-flash');
    expect(r).not.toBeNull();
    expect(r!.cmd.name).toBe('model');
    expect(r!.rawArgs).toBe('nim/stepfun-ai/step-3.7-flash');
    const r2 = reg.resolve('/provider connect anthropic');
    expect(r2).not.toBeNull();
    expect(r2!.cmd.name).toBe('provider');
    expect(r2!.rawArgs).toBe('connect anthropic');
  });

  it('fails for unknown command', () => {
    expect(reg.resolve('/nonexistent')).toBeNull();
  });

  it('handles bare slash', () => {
    expect(reg.resolve('/')).toBeNull();
  });

  it('every command has a unique name', () => {
    const names = all.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every alias maps to exactly one command', () => {
    const aliasToCmd = new Map<string, string>();
    for (const cmd of all) {
      if (cmd.aliases) {
        for (const a of cmd.aliases) {
          const key = a.replace(/^\//, '');
          if (aliasToCmd.has(key)) {
            throw new Error(`Alias "${key}" maps to both "${aliasToCmd.get(key)}" and "${cmd.name}"`);
          }
          aliasToCmd.set(key, cmd.name);
        }
      }
    }
  });

  it('no alias collides with a command name', () => {
    const names = new Set(all.map(c => c.name));
    for (const cmd of all) {
      if (cmd.aliases) {
        for (const a of cmd.aliases) {
          const key = a.replace(/^\//, '');
          expect(names.has(key)).toBe(false);
        }
      }
    }
  });

  it('every command has a category', () => {
    for (const cmd of all) {
      expect(cmd.category).toBeTruthy();
    }
  });

  it('every command has a summary', () => {
    for (const cmd of all) {
      expect(cmd.summary).toBeTruthy();
    }
  });

  it('every command has a usage', () => {
    for (const cmd of all) {
      expect(cmd.usage).toBeTruthy();
    }
  });
});
