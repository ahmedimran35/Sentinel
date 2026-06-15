import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { ReferenceResolver, type ResolvedReference } from './references.js';

describe('ReferenceResolver', () => {
  let resolver: ReferenceResolver;
  let tmpDir: string;

  beforeEach(() => {
    resolver = new ReferenceResolver();
    tmpDir = mkdtempSync(join(tmpdir(), 'ref-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolve', () => {
    it('resolves a simple file reference', async () => {
      writeFileSync(join(tmpDir, 'hello.ts'), 'const x = 1;\nconsole.log(x);\n');
      const result = await resolver.resolve('Check @hello.ts', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('file');
      expect(result.references[0]!.target).toBe('hello.ts');
      expect(result.references[0]!.filePath).toBe('hello.ts');
      expect(result.references[0]!.unresolved).toBeUndefined();
      expect(result.resolved).toContain('```ts');
      expect(result.resolved).toContain('const x = 1;');
    });

    it('resolves a line number reference', async () => {
      writeFileSync(join(tmpDir, 'hello.ts'), 'line1\nline2\nline3\n');
      const result = await resolver.resolve('Check @hello.ts:2', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('line');
      expect(result.references[0]!.target).toBe('hello.ts:2');
      expect(result.references[0]!.lineNumber).toBe(2);
      expect(result.resolved).toContain('line2');
      expect(result.resolved).not.toContain('line1');
      expect(result.resolved).not.toContain('line3');
    });

    it('resolves a line range reference', async () => {
      writeFileSync(join(tmpDir, 'hello.ts'), 'a\nb\nc\nd\ne\n');
      const result = await resolver.resolve('Check @hello.ts:2-4', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('range');
      expect(result.references[0]!.target).toBe('hello.ts:2-4');
      expect(result.references[0]!.lineNumber).toBe(2);
      expect(result.resolved).toContain('b');
      expect(result.resolved).toContain('c');
      expect(result.resolved).toContain('d');
      expect(result.resolved).not.toContain('5: e');
    });

    it('leaves missing file references intact and marks unresolved', async () => {
      const result = await resolver.resolve('Check @nonexistent.ts', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.unresolved).toBe(true);
      expect(result.references[0]!.content).toBe('@nonexistent.ts');
      expect(result.resolved).toBe('Check @nonexistent.ts');
    });

    it('resolves a function symbol reference', async () => {
      mkdirSync(join(tmpDir, 'src'));
      writeFileSync(
        join(tmpDir, 'src', 'math.ts'),
        'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
      );
      const result = await resolver.resolve('Check #add', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('symbol');
      expect(result.references[0]!.target).toBe('add');
      expect(result.references[0]!.filePath).toBe('src/math.ts');
      expect(result.references[0]!.lineNumber).toBe(1);
      expect(result.resolved).toContain('function add');
    });

    it('resolves a const arrow function symbol reference', async () => {
      writeFileSync(
        join(tmpDir, 'util.ts'),
        'export const greet = (name: string): string => {\n  return `Hello ${name}`;\n};\n',
      );
      const result = await resolver.resolve('Check #greet', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('symbol');
      expect(result.resolved).toContain('const greet');
    });

    it('resolves a class symbol reference', async () => {
      writeFileSync(
        join(tmpDir, 'user.ts'),
        'export class User {\n  name: string;\n  constructor(name: string) {\n    this.name = name;\n  }\n}\n',
      );
      const result = await resolver.resolve('Check #User', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.type).toBe('symbol');
      expect(result.resolved).toContain('class User');
    });

    it('leaves unresolved symbol references intact', async () => {
      const result = await resolver.resolve('Check #NonExistentSymbol', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.unresolved).toBe(true);
      expect(result.resolved).toBe('Check #NonExistentSymbol');
    });

    it('resolves multiple references in one text', async () => {
      writeFileSync(join(tmpDir, 'a.ts'), 'export const a = 1;\n');
      writeFileSync(join(tmpDir, 'b.ts'), 'export const b = 2;\n');
      const text = 'Check @a.ts and @b.ts';
      const result = await resolver.resolve(text, tmpDir);
      expect(result.references).toHaveLength(2);
      expect(result.resolved).toContain('a.ts');
      expect(result.resolved).toContain('b.ts');
      expect(result.resolved).not.toContain('@a.ts');
      expect(result.resolved).not.toContain('@b.ts');
    });

    it('handles empty text', async () => {
      const result = await resolver.resolve('', tmpDir);
      expect(result.references).toHaveLength(0);
      expect(result.resolved).toBe('');
    });

    it('handles text with no references', async () => {
      const result = await resolver.resolve('Just some regular text', tmpDir);
      expect(result.references).toHaveLength(0);
      expect(result.resolved).toBe('Just some regular text');
    });

    it('handles subdirectory file references', async () => {
      mkdirSync(join(tmpDir, 'lib'));
      writeFileSync(join(tmpDir, 'lib', 'core.ts'), 'export const version = 42;\n');
      const result = await resolver.resolve('Check @lib/core.ts', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.references[0]!.filePath).toBe('lib/core.ts');
      expect(result.resolved).toContain('version = 42');
    });
  });

  describe('resolveAsync', () => {
    it('resolves references with async yielding', async () => {
      writeFileSync(join(tmpDir, 'hello.ts'), 'const x = 1;\n');
      const result = await resolver.resolveAsync('Check @hello.ts', tmpDir);
      expect(result.references).toHaveLength(1);
      expect(result.resolved).toContain('const x = 1');
    });

    it('produces same result as resolve', async () => {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'a.ts'), 'const a = 1;\n');
      writeFileSync(join(tmpDir, 'src', 'b.ts'), 'const b = 2;\n');

      const syncResult = await resolver.resolve('@a.ts and @src/b.ts', tmpDir);
      resolver.clearCache();
      const asyncResult = await resolver.resolveAsync('@a.ts and @src/b.ts', tmpDir);

      expect(asyncResult.references).toHaveLength(syncResult.references.length);
      for (let i = 0; i < syncResult.references.length; i++) {
        expect(asyncResult.references[i]!.type).toBe(syncResult.references[i]!.type);
        expect(asyncResult.references[i]!.target).toBe(syncResult.references[i]!.target);
      }
    });
  });

  describe('formatReferences', () => {
    it('returns placeholder for empty list', () => {
      const output = resolver.formatReferences([]);
      expect(output).toBe('No references resolved.');
    });

    it('formats resolved file reference', () => {
      const refs: ResolvedReference[] = [
        { type: 'file', target: 'hello.ts', content: '...', filePath: 'hello.ts' },
      ];
      const output = resolver.formatReferences(refs);
      expect(output).toContain('hello.ts');
      expect(output).not.toContain('not found');
    });

    it('formats resolved symbol reference with line number', () => {
      const refs: ResolvedReference[] = [
        {
          type: 'symbol',
          target: 'add',
          content: '...',
          filePath: 'src/math.ts',
          lineNumber: 1,
        },
      ];
      const output = resolver.formatReferences(refs);
      expect(output).toContain('add');
      expect(output).toContain('src/math.ts:1');
    });

    it('formats unresolved reference', () => {
      const refs: ResolvedReference[] = [
        { type: 'file', target: 'missing.ts', content: '@missing.ts', unresolved: true },
      ];
      const output = resolver.formatReferences(refs);
      expect(output).toContain('missing.ts');
      expect(output).toContain('not found');
    });

    it('formats mixed resolved and unresolved', () => {
      const refs: ResolvedReference[] = [
        { type: 'file', target: 'found.ts', content: '...', filePath: 'found.ts' },
        { type: 'symbol', target: 'lost', content: '#lost', unresolved: true },
      ];
      const output = resolver.formatReferences(refs);
      expect(output).toContain('found.ts');
      expect(output).toContain('lost');
      expect(output).toContain('not found');
    });
  });
});
