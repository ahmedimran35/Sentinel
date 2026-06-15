import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateVSCodeExtension } from './ide-vscode.js';

describe('generateVSCodeExtension', () => {
  it('generates correct files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-vscode-test-'));
    await generateVSCodeExtension(tmpDir, { name: 'test-ext', serverPort: 5555 });

    const files = await readDirRecursive(tmpDir);
    expect(files).toContain('package.json');
    expect(files).toContain('src/extension.ts');
    expect(files).toContain('tsconfig.json');

    const pkg = JSON.parse(await fs.readFile(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('test-ext');
    expect(pkg.contributes.commands).toHaveLength(3);
    expect(pkg.contributes.commands.map((c: { command: string }) => c.command)).toEqual([
      'sentinel.run', 'sentinel.toggleChat', 'sentinel.diffView',
    ]);
    expect(pkg.contributes.keybindings).toHaveLength(2);

    const extSrc = await fs.readFile(path.join(tmpDir, 'src', 'extension.ts'), 'utf-8');
    expect(extSrc).toContain('localhost:5555');
    expect(extSrc).toContain('sentinel.run');
    expect(extSrc).toContain('sentinel.chat');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses default config when none provided', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-vscode-default-'));
    await generateVSCodeExtension(tmpDir);

    const pkg = JSON.parse(await fs.readFile(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('sentinel-vscode');
    expect(pkg.publisher).toBe('sentinel');
    expect(pkg.version).toBe('0.1.0');

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
