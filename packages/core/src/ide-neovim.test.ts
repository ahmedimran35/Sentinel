import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateNeovimPlugin } from './ide-neovim.js';

describe('generateNeovimPlugin', () => {
  it('generates correct files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-neovim-test-'));
    await generateNeovimPlugin(tmpDir, { serverPort: 3333, sentinelPath: '/usr/local/bin/sentinel' });

    const files = await readDirRecursive(tmpDir);
    expect(files).toContain('lua/sentinel/init.lua');
    expect(files).toContain('lua/sentinel/client.lua');
    expect(files).toContain('lua/sentinel/config.lua');
    expect(files).toContain('lua/sentinel/commands.lua');
    expect(files).toContain('plugin/sentinel.vim');

    const initLua = await fs.readFile(path.join(tmpDir, 'lua/sentinel/init.lua'), 'utf-8');
    expect(initLua).toContain('sentinel.config');
    expect(initLua).toContain('sentinel.commands');

    const configLua = await fs.readFile(path.join(tmpDir, 'lua/sentinel/config.lua'), 'utf-8');
    expect(configLua).toContain('port = 3333');
    expect(configLua).toContain('/usr/local/bin/sentinel');

    const commandsLua = await fs.readFile(path.join(tmpDir, 'lua/sentinel/commands.lua'), 'utf-8');
    expect(commandsLua).toContain('SentinelRun');
    expect(commandsLua).toContain('SentinelToggle');
    expect(commandsLua).toContain('SentinelExplain');

    const vimDetect = await fs.readFile(path.join(tmpDir, 'plugin/sentinel.vim'), 'utf-8');
    expect(vimDetect).toContain('g:loaded_sentinel');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates with defaults', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-neovim-default-'));
    await generateNeovimPlugin(tmpDir);

    const configLua = await fs.readFile(path.join(tmpDir, 'lua/sentinel/config.lua'), 'utf-8');
    expect(configLua).toContain('port = 4096');
    expect(configLua).toContain('sentinel_path = "sentinel"');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

async function readDirRecursive(dir: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(d: string, prefix: string) {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(d, entry.name), rel);
      } else {
        entries.push(rel);
      }
    }
  }
  await walk(dir, '');
  return entries;
}
