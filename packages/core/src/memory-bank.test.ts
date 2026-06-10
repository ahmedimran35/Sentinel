import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MemoryBank } from './memory-bank.js';

const testDir = path.join(os.tmpdir(), `sentinel-memory-test-${Date.now()}`);

describe('MemoryBank', () => {
  const mb = new MemoryBank(testDir);

  it('reads all memory files (empty by default)', async () => {
    const content = await mb.readAll();
    expect(content).toContain('architecture');
    expect(content).toContain('decisions');
    expect(content).toContain('conventions');
  });

  it('writes to a memory file', async () => {
    await mb.write('decisions.md', 'Use TypeScript strict mode');
    const content = await fs.readFile(path.join(testDir, '.sentinel/memory/decisions.md'), 'utf-8');
    expect(content).toBe('Use TypeScript strict mode');
  });

  it('appends to a memory file', async () => {
    await mb.append('decisions.md', 'Use ESM modules');
    const content = await fs.readFile(path.join(testDir, '.sentinel/memory/decisions.md'), 'utf-8');
    expect(content).toContain('Use TypeScript strict mode');
    expect(content).toContain('Use ESM modules');
  });
});
