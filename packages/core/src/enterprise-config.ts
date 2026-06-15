import { readFileSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > 200) return false;
  return !/\(.+\)[+*]/.test(pattern);
}

export interface EnterpriseConfig {
  organization?: string;
  policy?: {
    allowedProviders?: string[];
    allowedModels?: string[];
    maxTokensPerDay?: number;
    blockList?: string[];
    allowList?: string[];
    requireAnthropic?: boolean;
    maxSessions?: number;
    maxSessionMinutes?: number;
    idleTimeoutMinutes?: number;
    logAllActivity?: boolean;
    logDirectory?: string;
    disableAnonymousStats?: boolean;
    disableScreenshots?: boolean;
    allowedCommands?: string[];
    blockedCommands?: string[];
    requireApprovedPlugins?: boolean;
    pluginAllowList?: string[];
    themePolicy?: 'allow-all' | 'org-only' | 'none';
    agentPolicy?: 'allow-all' | 'org-only' | 'none';
    permissionOverrides?: Record<string, 'allow' | 'ask' | 'deny'>;
  };
  features?: {
    copilot?: boolean;
    autoUpdate?: boolean;
    usageReporting?: boolean;
    auditLogging?: boolean;
  };
  updateUrl?: string;
  signingKey?: string;
}

export interface ValidationContext {
  provider?: string;
  model?: string;
  tokensUsedToday?: number;
  command?: string;
  domain?: string;
  filePath?: string;
  activeSessions?: number;
  sessionMinutes?: number;
  idleMinutes?: number;
  pluginId?: string;
}

function tryReadFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function tryMacOSDefaults(): string | null {
  try {
    const home = homedir();
    const plistPath = join(home, 'Library', 'Preferences', 'com.sentinel.enterprise.plist');
    if (!existsSync(plistPath)) return null;
    const result = spawnSync('plutil', ['-convert', 'json', '-o', '-', plistPath], { encoding: 'utf-8', timeout: 5_000, stdio: 'pipe', stderr: 'ignore' });
    return (result.stdout ?? '').trim();
  } catch {
    return null;
  }
}

function tryLinuxPaths(): string | null {
  const paths = [
    join(homedir(), '.config', 'sentinel', 'enterprise.json'),
    '/etc/sentinel/enterprise.json',
  ];
  for (const p of paths) {
    const raw = tryReadFile(p);
    if (raw !== null) return raw;
  }
  return null;
}

function tryWindowsRegistry(): string | null {
  try {
    const script = [
      '$path = "HKCU:\\Software\\Sentinel\\Enterprise"',
      '$val = Get-ItemProperty -Path $path -Name "Config" -ErrorAction SilentlyContinue',
      'if ($val -and $val.Config) { Write-Output $val.Config }',
    ].join('; ');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf-8', timeout: 10_000 });
    const trimmed = (result.stdout ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function parseEnterpriseConfig(raw: string): EnterpriseConfig | null {
  try {
    return JSON.parse(raw) as EnterpriseConfig;
  } catch {
    return null;
  }
}

export function loadEnterpriseConfig(): EnterpriseConfig | null {
  const envRaw = process.env['SENTINEL_ENTERPRISE_CONFIG'];
  if (envRaw) {
    const parsed = parseEnterpriseConfig(envRaw);
    if (parsed !== null) return parsed;
  }

  const plt = platform();
  let raw: string | null = null;

  if (plt === 'darwin') {
    raw = tryMacOSDefaults();
  } else if (plt === 'win32') {
    raw = tryWindowsRegistry();
  } else {
    raw = tryLinuxPaths();
  }

  if (raw !== null) {
    const parsed = parseEnterpriseConfig(raw);
    if (parsed !== null) return parsed;
  }

  if (plt !== 'linux') {
    const etcRaw = tryReadFile('/etc/sentinel/enterprise.json');
    if (etcRaw !== null) {
      const parsed = parseEnterpriseConfig(etcRaw);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function loadManagedConfig(): EnterpriseConfig | null {
  return loadEnterpriseConfig();
}

export function validateAgainstEnterprise(
  config: EnterpriseConfig,
  context?: ValidationContext,
): { allowed: boolean; reasons?: string[] } {
  const reasons: string[] = [];
  const policy = config.policy;
  if (!policy) return { allowed: true };

  if (policy.allowedProviders && context?.provider) {
    if (!policy.allowedProviders.includes(context.provider)) {
      reasons.push(`Provider "${context.provider}" not in allowed list`);
    }
  }

  if (policy.allowedModels && context?.model) {
    const model = context.model;
    const matches = policy.allowedModels.some(pattern => {
      if (!isSafeRegex(pattern)) return false;
      try { return new RegExp(pattern).test(model); } catch { return false; }
    });
    if (!matches) {
      reasons.push(`Model "${context.model}" does not match any allowed pattern`);
    }
  }

  if (policy.maxTokensPerDay !== undefined && context?.tokensUsedToday !== undefined) {
    if (context.tokensUsedToday >= policy.maxTokensPerDay) {
      reasons.push(`Daily token limit of ${policy.maxTokensPerDay} exceeded`);
    }
  }

  if (policy.requireAnthropic && context?.provider && context.provider !== 'anthropic') {
    reasons.push('Anthropic provider required');
  }

  if (policy.maxSessions !== undefined && context?.activeSessions !== undefined) {
    if (context.activeSessions >= policy.maxSessions) {
      reasons.push(`Max sessions (${policy.maxSessions}) reached`);
    }
  }

  if (policy.maxSessionMinutes !== undefined && context?.sessionMinutes !== undefined) {
    if (context.sessionMinutes > policy.maxSessionMinutes) {
      reasons.push(`Session exceeds max duration of ${policy.maxSessionMinutes} minutes`);
    }
  }

  if (policy.idleTimeoutMinutes !== undefined && context?.idleMinutes !== undefined) {
    if (context.idleMinutes > policy.idleTimeoutMinutes) {
      reasons.push(`Session idle timeout of ${policy.idleTimeoutMinutes} minutes exceeded`);
    }
  }

  if (policy.blockedCommands && context?.command) {
    const cmd = context.command;
    const blocked = policy.blockedCommands.some(pattern => {
      if (!isSafeRegex(pattern)) return false;
      try { return new RegExp(pattern).test(cmd); } catch { return false; }
    });
    if (blocked) {
      reasons.push('Command blocked by enterprise policy');
    }
  }

  if (policy.allowedCommands && context?.command) {
    const cmd = context.command;
    const allowed = policy.allowedCommands.some(pattern => {
      if (!isSafeRegex(pattern)) return false;
      try { return new RegExp(pattern).test(cmd); } catch { return false; }
    });
    if (!allowed) {
      reasons.push('Command not in allowed list');
    }
  }

  if (policy.requireApprovedPlugins && policy.pluginAllowList && context?.pluginId) {
    if (!policy.pluginAllowList.includes(context.pluginId)) {
      reasons.push(`Plugin "${context.pluginId}" not in approved list`);
    }
  }

  return reasons.length > 0
    ? { allowed: false, reasons }
    : { allowed: true };
}
