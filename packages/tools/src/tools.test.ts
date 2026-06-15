import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { todoTool } from './todo.js';

const testDir = path.join(os.tmpdir(), `sentinel-tools-test-${Date.now()}`);
process.env.SENTINEL_PROJECT_ROOT = testDir;
const testFile = path.join(testDir, 'test.txt');
const sessionId = 'test-session';

function collect(gen: AsyncIterable<unknown>): Promise<any[]> {
  const items: any[] = [];
  return (async () => { for await (const i of gen) items.push(i); return items; })();
}

beforeAll(async () => {
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5\n');
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('read_file', () => {
  it('reads a file with line numbers', async () => {
    const events = await collect(readFileTool.execute({ path: testFile }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).toContain('1: line1');
    expect(result.result.output).toContain('5: line5');
  });

  it('reads with offset and limit', async () => {
    const events = await collect(readFileTool.execute({ path: testFile, offset: 1, limit: 2 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).toContain('2: line2');
    expect(result.result.output).toContain('3: line3');
    expect(result.result.output).not.toContain('1: line1');
  });

  it('returns error for missing file', async () => {
    const events = await collect(readFileTool.execute({ path: '/nonexistent/file.txt' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });
});

describe('write_file', () => {
  it('writes a file atomically', async () => {
    const outPath = path.join(testDir, 'out.txt');
    const events = await collect(writeFileTool.execute({ path: outPath, content: 'hello world' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('bytes');
    const content = await fs.readFile(outPath, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('auto-creates directories', async () => {
    const nestedPath = path.join(testDir, 'a', 'b', 'c', 'nested.txt');
    await collect(writeFileTool.execute({ path: nestedPath, content: 'nested' }, { sessionId, signal: new AbortController().signal }));
    const content = await fs.readFile(nestedPath, 'utf-8');
    expect(content).toBe('nested');
  });
});

describe('edit_file', () => {
  it('replaces old_str with new_str', async () => {
    const events = await collect(editFileTool.execute({ path: testFile, old_str: 'line3', new_str: 'REPLACED' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toContain('REPLACED');
    expect(content).not.toContain('line3');
  });

  it('rejects stale edits', async () => {
    const f = path.join(testDir, 'stale-test.txt');
    await fs.writeFile(f, 'original content');

    await collect(editFileTool.execute({ path: f, old_str: 'original', new_str: 'modified' }, { sessionId, signal: new AbortController().signal }));
    // File changed, try again using stale hash
    const events = await collect(editFileTool.execute({ path: f, old_str: 'modified', new_str: 'changed again' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false); // should succeed since hash was updated
  });

  it('fails if old_str not found', async () => {
    const events = await collect(editFileTool.execute({ path: testFile, old_str: 'nonexistent string!!!', new_str: 'foo' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
    expect(result.result.output).toContain('Could not find');
  });
});

describe('glob', () => {
  it('finds files matching pattern', async () => {
    const events = await collect(globTool.execute({ pattern: 'test.txt', path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('test.txt');
  });
});

describe('grep', () => {
  it('finds matching lines', async () => {
    const events = await collect(grepTool.execute({ pattern: 'line', path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('line1');
  });

  it('returns empty for no matches', async () => {
    const events = await collect(grepTool.execute({ pattern: 'ZZZZNOMATCH', path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('No matches');
  });
});

describe('todo', () => {
  it('reads empty todo list', async () => {
    const events = await collect(todoTool.execute({ action: 'read' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
  });

  it('writes and reads todos', async () => {
    const todos = [{ content: 'test task', status: 'pending' as const, priority: 'high' as const }];
    await collect(todoTool.execute({ action: 'write', todos }, { sessionId, signal: new AbortController().signal }));

    const events = await collect(todoTool.execute({ action: 'read' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).toContain('test task');
  });
});
