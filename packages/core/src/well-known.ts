import { spawnSync } from 'node:child_process';

export interface WellKnownConfig {
  version: string;
  organization?: string;
  policy?: {
    allowedProviders?: string[];
    allowedModels?: string[];
    requireAnthropic?: boolean;
    maxTokensPerDay?: number;
    allowedCommands?: string[];
    blockedCommands?: string[];
  };
  updateUrl?: string;
  features?: Record<string, boolean>;
  signingKey?: string;
}

function getGitRemoteOrigin(): string | null {
  try {
    const result = spawnSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf-8', timeout: 5_000 });
    const output = (result.stdout ?? '').trim() || null;
    return output;
  } catch {
    return null;
  }
}

function extractHostFromGitUrl(url: string): string | null {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  const sshMatch = url.match(/^git@([^:]+):/);
  if (sshMatch) {
    return sshMatch[1] ?? null;
  }

  const sshUrlMatch = url.match(/^ssh:\/\/(?:git@)?([^\/]+)/);
  if (sshUrlMatch) {
    return sshUrlMatch[1] ?? null;
  }

  return null;
}

export function parseWellKnownUrl(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return {
      host: parsed.hostname,
      path: parsed.pathname,
    };
  } catch {
    return null;
  }
}

export async function fetchWellKnownConfig(): Promise<WellKnownConfig | null> {
  let url: string | undefined;

  const envUrl = process.env['SENTINEL_WELL_KNOWN_URL'];
  if (envUrl) {
    url = envUrl;
  } else {
    const remoteUrl = getGitRemoteOrigin();
    if (remoteUrl) {
      const host = extractHostFromGitUrl(remoteUrl);
      if (host) {
        url = `https://${host}/.well-known/opencode`;
      }
    }
  }

  if (!url) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const text = await response.text();
    const parsed = JSON.parse(text) as WellKnownConfig;
    if (!parsed.version) return null;
    return parsed;
  } catch {
    return null;
  }
}
