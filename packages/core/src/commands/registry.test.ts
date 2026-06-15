import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './registry.js';
import { parseArgs } from './types.js';
import type { SlashCommand } from './types.js';

function fakeCmd(overrides: Partial<SlashCommand> & { name: string }): SlashCommand {
  return {
    aliases: [],
    summary: 'test command',
    usage: `/${overrides.name}`,
    category: 'session',
    kind: 'builtin',
    source: 'core',
    run: async () => {},
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('registers and resolves a command by name', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'test' }));
    const result = reg.resolve('/test');
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe('test');
    expect(result!.rawArgs).toBe('');
  });

  it('resolves by alias', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'help', aliases: ['h', '?'] }));
    const result = reg.resolve('/?');
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe('help');
  });

  it('returns null for unknown command', () => {
    const reg = new CommandRegistry();
    expect(reg.resolve('/nope')).toBeNull();
  });

  it('extracts raw arguments', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'compact' }));
    const result = reg.resolve('/compact focus on testing');
    expect(result).not.toBeNull();
    expect(result!.cmd.name).toBe('compact');
    expect(result!.rawArgs).toBe('focus on testing');
  });

  it('handles command without leading slash', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'clear' }));
    expect(reg.resolve('clear')).not.toBeNull();
    expect(reg.resolve('/clear')).not.toBeNull();
  });

  it('overrides with warning when source is same level', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'test', source: 'core', summary: 'original' }));
    reg.register(fakeCmd({ name: 'test', source: 'core', summary: 'override' }));
    const result = reg.resolve('/test');
    expect(result!.cmd.summary).toBe('override');
  });

  it('core overrides custom with warning', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'test', source: 'project', summary: 'custom' }));
    reg.register(fakeCmd({ name: 'test', source: 'core', summary: 'core' }));
    const result = reg.resolve('/test');
    expect(result!.cmd.summary).toBe('core');
  });

  it('lists all commands', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'a' }));
    reg.register(fakeCmd({ name: 'b' }));
    expect(reg.all()).toHaveLength(2);
  });

  it('groups by category', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'a', category: 'session' }));
    reg.register(fakeCmd({ name: 'b', category: 'session' }));
    reg.register(fakeCmd({ name: 'c', category: 'context' }));
    const groups = reg.byCategory();
    expect(groups.session).toHaveLength(2);
    expect(groups.context).toHaveLength(1);
  });

  it('removes a command', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'test' }));
    expect(reg.remove('test')).toBe(true);
    expect(reg.resolve('/test')).toBeNull();
  });

  it('remove also removes aliases', () => {
    const reg = new CommandRegistry();
    reg.register(fakeCmd({ name: 'help', aliases: ['/?'] }));
    reg.remove('help');
    expect(reg.resolve('/?')).toBeNull();
  });
});

describe('parseArgs', () => {
  it('parses positional args', () => {
    const result = parseArgs('foo bar baz');
    expect(result.positional).toEqual(['foo', 'bar', 'baz']);
  });

  it('parses named args with --', () => {
    const result = parseArgs('--name value');
    expect(result.named).toEqual({ name: 'value' });
  });

  it('parses --key=value syntax', () => {
    const result = parseArgs('--name=value');
    expect(result.named).toEqual({ name: 'value' });
  });

  it('respects quotes', () => {
    const result = parseArgs('"hello world" foo');
    expect(result.positional).toEqual(['hello world', 'foo']);
  });

  it('extracts @file references', () => {
    const result = parseArgs('@src/index.ts @test.ts');
    expect(result.files).toHaveLength(2);
    expect(result.files[0]!.path).toBe('src/index.ts');
  });

  it('extracts !shell commands', () => {
    const result = parseArgs('!ls !pwd');
    expect(result.shellOutputs).toHaveLength(2);
    expect(result.shellOutputs[0]!.command).toBe('ls');
    expect(result.shellOutputs[1]!.command).toBe('pwd');
  });

  it('handles mixed args', () => {
    const result = parseArgs('@file.txt !cmd --opt=val pos');
    expect(result.files).toHaveLength(1);
    expect(result.shellOutputs).toHaveLength(1);
    expect(result.named).toEqual({ opt: 'val' });
    expect(result.positional).toEqual(['pos']);
  });

  it('returns empty for empty input', () => {
    const result = parseArgs('');
    expect(result.positional).toEqual([]);
    expect(result.named).toEqual({});
  });
});
