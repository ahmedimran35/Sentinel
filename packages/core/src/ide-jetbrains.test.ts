import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateJetBrainsPlugin } from './ide-jetbrains.js';

describe('generateJetBrainsPlugin', () => {
  it('generates correct files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-jetbrains-test-'));
    await generateJetBrainsPlugin(tmpDir, { name: 'test-plugin', serverPort: 7777 });

    const files = await readDirRecursive(tmpDir);
    expect(files).toContain('build.gradle.kts');
    expect(files).toContain('src/main/resources/META-INF/plugin.xml');

    const hasKotlinFiles = files.filter((f) => f.endsWith('.kt'));
    expect(hasKotlinFiles).toContain('src/main/kotlin/test/plugin/SentinelToolWindowFactory.kt');
    expect(hasKotlinFiles).toContain('src/main/kotlin/test/plugin/SentinelAction.kt');
    expect(hasKotlinFiles).toContain('src/main/kotlin/test/plugin/SentinelClient.kt');
    expect(hasKotlinFiles).toContain('src/main/kotlin/test/plugin/SentinelPanel.kt');

    const pluginXml = await fs.readFile(path.join(tmpDir, 'src/main/resources/META-INF/plugin.xml'), 'utf-8');
    expect(pluginXml).toContain('test-plugin');
    expect(pluginXml).toContain('SentinelAction');

    const clientKt = await fs.readFile(
      path.join(tmpDir, 'src/main/kotlin/test/plugin/SentinelClient.kt'), 'utf-8',
    );
    expect(clientKt).toContain('localhost:7777');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates with default config', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-jetbrains-default-'));
    await generateJetBrainsPlugin(tmpDir);

    const buildGradle = await fs.readFile(path.join(tmpDir, 'build.gradle.kts'), 'utf-8');
    expect(buildGradle).toContain('sentinel-jetbrains');
    expect(buildGradle).toContain('0.1.0');

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
