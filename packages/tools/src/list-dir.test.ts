import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listTool } from './list-dir.js';

function collect(gen: AsyncIterable<unknown>): Promise<any[]> {
  const items: any[] = [];
  return (async () => { for await (const i of gen) items.push(i); return items; })();
}

const testDir = path.join(os.tmpdir(), `sentinel-list-test-${Date.now()}`);
const sessionId = 'list-test-session';

beforeAll(async () => {
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
  await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
  await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });
  await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested');
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('listTool', () => {
  beforeAll(() => {
    process.env.SENTINEL_PROJECT_ROOT = path.resolve(testDir, '..');
  });

  it('lists directory contents', async () => {
    const events = await collect(listTool.execute({ path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('file1.txt');
    expect(result.result.output).toContain('file2.txt');
    expect(result.result.output).toContain('subdir/');
  });

  it('lists with depth 0 (top only)', async () => {
    const events = await collect(listTool.execute({ path: testDir, depth: 0 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('file1.txt');
  });

  it('shows nested contents with depth 2', async () => {
    const events = await collect(listTool.execute({ path: testDir, depth: 2 }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('nested.txt');
  });

  it('returns empty directory message', async () => {
    const emptyDir = path.join(testDir, 'empty');
    await fs.mkdir(emptyDir);

    const events = await collect(listTool.execute({ path: emptyDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('empty directory');
  });

  it('returns error for non-existent path', async () => {
    const events = await collect(listTool.execute({ path: '/nonexistent/path/xyz' }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(true);
  });

  it('shows file sizes', async () => {
    const events = await collect(listTool.execute({ path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.output).toMatch(/file1\.txt.*\(\d+ B\)/);
  });

  it('uses default depth of 1', async () => {
    const events = await collect(listTool.execute({ path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('file1.txt');
    expect(result.result.output).toContain('subdir/');
  });

  it('resolves dot as current directory when inside project root', async () => {
    process.env.SENTINEL_PROJECT_ROOT = testDir;
    const events = await collect(listTool.execute({ path: testDir }, { sessionId, signal: new AbortController().signal }));
    const result = events.find((e: any) => e.type === 'tool_result');
    expect(result.result.isError).toBe(false);
    expect(result.result.output).toContain('file1.txt');
  });
});
