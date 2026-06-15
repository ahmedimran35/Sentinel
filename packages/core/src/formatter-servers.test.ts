import { describe, it, expect } from 'vitest';
import { builtinFormatters } from './formatter-servers.js';
import { FormatterEngine } from './formatter.js';

describe('builtinFormatters', () => {
  it('has at least 25 formatters', () => {
    expect(builtinFormatters.length).toBeGreaterThanOrEqual(25);
  });

  for (const fmt of builtinFormatters) {
    it(`formatter "${fmt.name}" has required fields`, () => {
      expect(fmt.name).toBeTruthy();
      expect(Array.isArray(fmt.extensions)).toBe(true);
      expect(fmt.extensions.length).toBeGreaterThan(0);
      expect(Array.isArray(fmt.command)).toBe(true);
      expect(fmt.command.length).toBeGreaterThan(0);
      expect(fmt.command).toContain('$FILE');
    });

    it(`formatter "${fmt.name}" has unique extensions (no duplicates within formatter)`, () => {
      const unique = new Set(fmt.extensions);
      expect(unique.size).toBe(fmt.extensions.length);
    });
  }

  it('all formatter names are unique', () => {
    const names = builtinFormatters.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('includes key formatters', () => {
    const names = builtinFormatters.map((f) => f.name);
    expect(names).toContain('prettier');
    expect(names).toContain('ruff');
    expect(names).toContain('rustfmt');
    expect(names).toContain('gofmt');
    expect(names).toContain('biome');
  });

  it('each command contains a $FILE placeholder', () => {
    for (const fmt of builtinFormatters) {
      expect(fmt.command).toContain('$FILE');
    }
  });
});

describe('FormatterDef $FILE placeholder', () => {
  it('replaces $FILE with actual file path in command', () => {
    const engine = new FormatterEngine([
      { name: 'testfmt', extensions: ['.xyz'], command: ['tool', '$FILE', '--out', '$FILE'], requirements: [] },
    ]);
    const def = (engine as any).resolved[0];
    const replaced = def.command.map((part: string) => part === '$FILE' ? '/path/to/file.xyz' : part);
    expect(replaced).toEqual(['tool', '/path/to/file.xyz', '--out', '/path/to/file.xyz']);
  });
});

describe('Extension matching priority', () => {
  it('matches first configured formatter for an extension', () => {
    const defs = [
      { name: 'primary', extensions: ['.js'], command: ['primary', '$FILE'], requirements: [] },
      { name: 'secondary', extensions: ['.js', '.ts'], command: ['secondary', '$FILE'], requirements: [] },
    ];
    const engine = new FormatterEngine(defs);
    const extMap = (engine as any).extMap as Map<string, any>;
    expect(extMap.get('.js').name).toBe('primary');
    expect(extMap.get('.ts').name).toBe('secondary');
  });

  it('first matching formatter takes priority for shared extensions', () => {
    const defs = [
      { name: 'a', extensions: ['.js', '.ts'], command: ['a', '$FILE'], requirements: [] },
      { name: 'b', extensions: ['.js'], command: ['b', '$FILE'], requirements: [] },
    ];
    const engine = new FormatterEngine(defs);
    const extMap = (engine as any).extMap as Map<string, any>;
    expect(extMap.get('.js').name).toBe('a');
    expect(extMap.get('.ts').name).toBe('a');
  });

  it('ignores disabled formatters during extension mapping', () => {
    const defs = [
      { name: 'enabled', extensions: ['.js'], command: ['tool', '$FILE'], requirements: [] },
      { name: 'disabled', extensions: ['.js'], command: ['tool', '$FILE'], requirements: [], disabled: true },
    ];
    const engine = new FormatterEngine(defs);
    const extMap = (engine as any).extMap as Map<string, any>;
    expect(extMap.get('.js').name).toBe('enabled');
  });
});

describe('Per-formatter disable via overrides', () => {
  it('disabled override removes formatter from resolution', () => {
    const defs = [
      { name: 'fmt1', extensions: ['.js'], command: ['tool', '$FILE'], requirements: [] },
      { name: 'fmt2', extensions: ['.ts'], command: ['tool', '$FILE'], requirements: [] },
    ];
    const engine = new FormatterEngine(defs, { fmt1: { disabled: true } });
    const extMap = (engine as any).extMap as Map<string, any>;
    expect(extMap.has('.js')).toBe(false);
    expect(extMap.get('.ts').name).toBe('fmt2');
  });
});

describe('Per-formatter env', () => {
  it('stores env in the resolved formatter def', () => {
    const defs = [
      { name: 'testenv', extensions: ['.envtest'], command: ['tool', '$FILE'], env: { FOO: 'bar' }, requirements: [] },
    ];
    const engine = new FormatterEngine(defs);
    const def = (engine as any).resolved[0];
    expect(def.env).toEqual({ FOO: 'bar' });
  });
});

describe('detectAvailableFormatters', () => {
  it('returns empty when no requirements are met', async () => {
    const defs = [
      { name: 'impossible', extensions: ['.x'], command: ['nonexistent-tool-xyz', '$FILE'], requirements: ['nonexistent-tool-xyz'] },
    ];
    const engine = new FormatterEngine(defs);
    const available = await engine.detectAvailableFormatters();
    expect(available).toEqual([]);
  });
});
