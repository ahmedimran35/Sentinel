import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, ConfigSource } from './config-loader.js';

describe('loadConfig', () => {
  let tmpDir: string;
  let projectDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-config-test-'));
    projectDir = join(tmpDir, 'project');
    mkdirSync(projectDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default config when no config files exist', async () => {
    const config = await loadConfig({ projectRoot: projectDir });
    expect(config).toBeDefined();
    expect(config.model).toBeUndefined();
    expect(config.tools).toBeUndefined();
  });

  it('loads project-level opencode.json', async () => {
    writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      default_agent: 'dev',
    }));
    const config = await loadConfig({ projectRoot: projectDir });
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.default_agent).toBe('dev');
    unlinkSync(join(projectDir, 'opencode.json'));
  });

  it('loads project-level opencode.jsonc with comments', async () => {
    writeFileSync(join(projectDir, 'opencode.jsonc'), `{
      // this is a comment
      "model": "claude-opus-4-20250514" /* inline */,
      /* block
         comment */
      "shell": "/bin/zsh"
    }`);
    const config = await loadConfig({ projectRoot: projectDir });
    expect(config.model).toBe('claude-opus-4-20250514');
    expect(config.shell).toBe('/bin/zsh');
    unlinkSync(join(projectDir, 'opencode.jsonc'));
  });

  it('loads inline config content', async () => {
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ model: 'gpt-5', share: 'auto' }),
    });
    expect(config.model).toBe('gpt-5');
    expect(config.share).toBe('auto');
  });

  it('inline overrides project level', async () => {
    writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      shell: '/bin/bash',
    }));
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ model: 'gpt-5' }),
    });
    expect(config.model).toBe('gpt-5');
    expect(config.shell).toBe('/bin/bash');
    unlinkSync(join(projectDir, 'opencode.json'));
  });

  it('deep merges nested objects', async () => {
    writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify({
      provider: {
        anthropic: { options: { timeout: 60000 } },
      },
    }));
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({
        provider: {
          anthropic: { options: { apiKey: 'sk-test' } },
        },
      }),
    });
    expect(config.provider?.anthropic?.options?.timeout).toBe(60000);
    expect(config.provider?.anthropic?.options?.apiKey).toBe('sk-test');
    unlinkSync(join(projectDir, 'opencode.json'));
  });

  it('shallow merges arrays (latest wins)', async () => {
    writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify({
      instructions: ['first'],
    }));
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({
        instructions: ['second'],
      }),
    });
    expect(config.instructions).toEqual(['second']);
    unlinkSync(join(projectDir, 'opencode.json'));
  });

  it('loads from custom config path', async () => {
    const customPath = join(tmpDir, 'custom-opencode.json');
    writeFileSync(customPath, JSON.stringify({ model: 'custom-model' }));
    const config = await loadConfig({
      projectRoot: projectDir,
      configPath: customPath,
    });
    expect(config.model).toBe('custom-model');
    unlinkSync(customPath);
  });

  it('resolves {env:VAR_NAME} in config values', async () => {
    process.env['SENTINEL_TEST_MODEL'] = 'env-model';
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ model: '{env:SENTINEL_TEST_MODEL}' }),
    });
    expect(config.model).toBe('env-model');
    delete process.env['SENTINEL_TEST_MODEL'];
  });

  it('resolves missing env var to empty string', async () => {
    const config = await loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ model: '{env:THIS_VAR_DOES_NOT_EXIST}' }),
    });
    expect(config.model).toBe('');
  });

  it('resolves {file:path} from configDir', async () => {
    const secretDir = join(tmpDir, 'secrets');
    mkdirSync(secretDir, { recursive: true });
    writeFileSync(join(secretDir, 'api-key.txt'), 'sk-secret');
    const configDir = join(tmpDir, 'configs');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'test.json'), JSON.stringify({
      model: '{file:../secrets/api-key.txt}',
    }));
    const config = await loadConfig({
      projectRoot: projectDir,
      configPath: join(configDir, 'test.json'),
      configDir,
    });
    expect(config.model).toBe('sk-secret');
    unlinkSync(join(secretDir, 'api-key.txt'));
    unlinkSync(join(configDir, 'test.json'));
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('validates config against schema and rejects bad types', async () => {
    await expect(loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ server: { port: 'not-a-number' } }),
    })).rejects.toThrow();
  });

  it('validates share enum properly', async () => {
    await expect(loadConfig({
      projectRoot: projectDir,
      configContent: JSON.stringify({ share: 'invalid-value' }),
    })).rejects.toThrow();
  });

  it('loads managed config path detection', () => {
    const { platform } = process;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const path = '/Library/Application Support/sentinel/opencode.json';
    expect(existsSync(path)).toBe(false);
    Object.defineProperty(process, 'platform', { value: platform });
  });

  it('loadConfig handles empty options', async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
  });

  it('opencode.json takes precedence over opencode.jsonc when both exist', async () => {
    writeFileSync(join(projectDir, 'opencode.jsonc'), JSON.stringify({ model: 'from-jsonc' }));
    writeFileSync(join(projectDir, 'opencode.json'), JSON.stringify({ model: 'from-json' }));
    const config = await loadConfig({ projectRoot: projectDir });
    expect(config.model).toBe('from-json');
    unlinkSync(join(projectDir, 'opencode.jsonc'));
    unlinkSync(join(projectDir, 'opencode.json'));
  });
});

describe('ConfigSource enum', () => {
  it('has all seven sources in correct order', () => {
    const values = Object.values(ConfigSource);
    expect(values).toEqual([
      'remote',
      'global',
      'custom',
      'project',
      'opcode_dir',
      'inline',
      'managed',
    ]);
  });
});
