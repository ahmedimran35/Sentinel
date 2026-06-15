import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnterpriseConfig, loadManagedConfig, validateAgainstEnterprise } from './enterprise-config.js';
import type { EnterpriseConfig, ValidationContext } from './enterprise-config.js';

describe('loadEnterpriseConfig', () => {
  const validConfig: EnterpriseConfig = {
    organization: 'Acme Corp',
    policy: {
      allowedProviders: ['anthropic'],
      allowedModels: ['^claude-'],
      maxTokensPerDay: 1_000_000,
    },
  };

  afterEach(() => {
    delete process.env['SENTINEL_ENTERPRISE_CONFIG'];
  });

  it('returns null when no config is available', () => {
    expect(loadEnterpriseConfig()).toBeNull();
  });

  it('loads from SENTINEL_ENTERPRISE_CONFIG env var', () => {
    process.env['SENTINEL_ENTERPRISE_CONFIG'] = JSON.stringify(validConfig);
    expect(loadEnterpriseConfig()).toEqual(validConfig);
  });

  it('returns null for invalid JSON in env var', () => {
    process.env['SENTINEL_ENTERPRISE_CONFIG'] = 'not-json';
    expect(loadEnterpriseConfig()).toBeNull();
  });

  it('loads from ~/.config/sentinel/enterprise.json on Linux', () => {
    const origPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const tmpDir = mkdtempSync(join(tmpdir(), 'sentinel-enterprise-test-'));
    const configDir = join(tmpDir, '.config', 'sentinel');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'enterprise.json'), JSON.stringify(validConfig));

    const origHome = process.env['HOME'];
    process.env['HOME'] = tmpDir;

    try {
      const result = loadEnterpriseConfig();
      expect(result).toEqual(validConfig);
    } finally {
      if (origHome !== undefined) {
        process.env['HOME'] = origHome;
      } else {
        delete process.env['HOME'];
      }
      Object.defineProperty(process, 'platform', { value: origPlatform });
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loadManagedConfig is an alias for loadEnterpriseConfig', () => {
    process.env['SENTINEL_ENTERPRISE_CONFIG'] = JSON.stringify(validConfig);
    expect(loadManagedConfig()).toEqual(loadEnterpriseConfig());
  });
});

describe('validateAgainstEnterprise', () => {
  it('allows when no policy is set', () => {
    const config: EnterpriseConfig = { organization: 'Acme' };
    expect(validateAgainstEnterprise(config)).toEqual({ allowed: true });
  });

  it('allows when no restrictions match', () => {
    const config: EnterpriseConfig = {
      policy: { allowedProviders: ['anthropic'] },
    };
    expect(validateAgainstEnterprise(config, { provider: 'anthropic' })).toEqual({ allowed: true });
  });

  it('rejects disallowed provider', () => {
    const config: EnterpriseConfig = {
      policy: { allowedProviders: ['anthropic'] },
    };
    const result = validateAgainstEnterprise(config, { provider: 'openai' });
    expect(result.allowed).toBe(false);
    expect(result.reasons![0]).toContain('not in allowed list');
  });

  it('rejects model not matching allowed patterns', () => {
    const config: EnterpriseConfig = {
      policy: { allowedModels: ['^claude-'] },
    };
    expect(validateAgainstEnterprise(config, { model: 'gpt-4' }).allowed).toBe(false);
  });

  it('allows model matching regex pattern', () => {
    const config: EnterpriseConfig = {
      policy: { allowedModels: ['^claude-'] },
    };
    expect(validateAgainstEnterprise(config, { model: 'claude-opus-4-20250514' }).allowed).toBe(true);
  });

  it('rejects when daily token limit exceeded', () => {
    const config: EnterpriseConfig = {
      policy: { maxTokensPerDay: 1000 },
    };
    expect(validateAgainstEnterprise(config, { tokensUsedToday: 1500 }).allowed).toBe(false);
  });

  it('allows when tokens are under limit', () => {
    const config: EnterpriseConfig = {
      policy: { maxTokensPerDay: 1000 },
    };
    expect(validateAgainstEnterprise(config, { tokensUsedToday: 500 }).allowed).toBe(true);
  });

  it('rejects when requireAnthropic and provider is not anthropic', () => {
    const config: EnterpriseConfig = {
      policy: { requireAnthropic: true },
    };
    expect(validateAgainstEnterprise(config, { provider: 'openai' }).allowed).toBe(false);
  });

  it('allows when requireAnthropic and provider is anthropic', () => {
    const config: EnterpriseConfig = {
      policy: { requireAnthropic: true },
    };
    expect(validateAgainstEnterprise(config, { provider: 'anthropic' }).allowed).toBe(true);
  });

  it('rejects blocked commands', () => {
    const config: EnterpriseConfig = {
      policy: { blockedCommands: ['rm\\s+-rf'] },
    };
    expect(validateAgainstEnterprise(config, { command: 'rm -rf /' }).allowed).toBe(false);
  });

  it('rejects commands not in allowed list', () => {
    const config: EnterpriseConfig = {
      policy: { allowedCommands: ['^git\\s+', '^npm\\s+'] },
    };
    expect(validateAgainstEnterprise(config, { command: 'curl http://evil.com' }).allowed).toBe(false);
  });

  it('allows commands in allowed list', () => {
    const config: EnterpriseConfig = {
      policy: { allowedCommands: ['^git\\s+', '^npm\\s+'] },
    };
    expect(validateAgainstEnterprise(config, { command: 'git push' }).allowed).toBe(true);
  });

  it('rejects unapproved plugin', () => {
    const config: EnterpriseConfig = {
      policy: {
        requireApprovedPlugins: true,
        pluginAllowList: ['plugin-a', 'plugin-b'],
      },
    };
    expect(validateAgainstEnterprise(config, { pluginId: 'plugin-c' }).allowed).toBe(false);
  });

  it('allows approved plugin', () => {
    const config: EnterpriseConfig = {
      policy: {
        requireApprovedPlugins: true,
        pluginAllowList: ['plugin-a', 'plugin-b'],
      },
    };
    expect(validateAgainstEnterprise(config, { pluginId: 'plugin-a' }).allowed).toBe(true);
  });

  it('rejects when maxSessions reached', () => {
    const config: EnterpriseConfig = {
      policy: { maxSessions: 2 },
    };
    expect(validateAgainstEnterprise(config, { activeSessions: 3 }).allowed).toBe(false);
  });

  it('rejects when session exceeds max duration', () => {
    const config: EnterpriseConfig = {
      policy: { maxSessionMinutes: 60 },
    };
    expect(validateAgainstEnterprise(config, { sessionMinutes: 90 }).allowed).toBe(false);
  });

  it('rejects when idle timeout exceeded', () => {
    const config: EnterpriseConfig = {
      policy: { idleTimeoutMinutes: 30 },
    };
    expect(validateAgainstEnterprise(config, { idleMinutes: 45 }).allowed).toBe(false);
  });

  it('ignores policy checks when context is missing', () => {
    const config: EnterpriseConfig = {
      policy: { allowedProviders: ['anthropic'], requireAnthropic: true },
    };
    expect(validateAgainstEnterprise(config)).toEqual({ allowed: true });
  });

  it('collects multiple violation reasons', () => {
    const config: EnterpriseConfig = {
      policy: {
        allowedProviders: ['anthropic'],
        allowedModels: ['^claude-'],
        maxTokensPerDay: 1000,
      },
    };
    const ctx: ValidationContext = {
      provider: 'openai',
      model: 'gpt-4',
      tokensUsedToday: 2000,
    };
    const result = validateAgainstEnterprise(config, ctx);
    expect(result.allowed).toBe(false);
    expect(result.reasons!.length).toBeGreaterThanOrEqual(3);
  });
});
