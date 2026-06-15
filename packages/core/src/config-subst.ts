import { homedir, hostname, userInfo } from 'os';
import { randomUUID, randomBytes } from 'crypto';

function getDate(format?: string): string {
  const now = new Date();
  if (!format) return now.toISOString();
  const map: Record<string, string> = {
    YYYY: String(now.getFullYear()),
    MM: String(now.getMonth() + 1).padStart(2, '0'),
    DD: String(now.getDate()).padStart(2, '0'),
    HH: String(now.getHours()).padStart(2, '0'),
    mm: String(now.getMinutes()).padStart(2, '0'),
    ss: String(now.getSeconds()).padStart(2, '0'),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, m => map[m]!);
}

function resolveVar(name: string, context?: Record<string, string>): string | undefined {
  const key = name.toUpperCase().replace(/_/g, '');

  if (key === 'PROJECTROOT') return context?.projectRoot ?? context?.PROJECT_ROOT ?? process.cwd();
  if (key === 'HOME') return homedir();
  if (key === 'USER') return userInfo().username;
  if (key === 'PID') return String(process.pid);
  if (key === 'TIME') return new Date().toISOString();
  if (key === 'UUID') return randomUUID();
  if (key === 'HOSTNAME') return hostname();
  if (key === 'OS') return process.platform;
  if (key === 'ARCH') return process.arch;
  if (key === 'SHELL') return process.env.SHELL || '/bin/bash';
  if (key === 'DATE') return getDate();

  if (key.startsWith('DATE:')) {
    return getDate(name.slice(name.indexOf(':') + 1));
  }

  if (key.startsWith('RANDOM')) {
    const colonIdx = name.indexOf(':');
    const lenStr = colonIdx >= 0 ? name.slice(colonIdx + 1) : '8';
    const len = parseInt(lenStr, 10);
    const n = isNaN(len) || len < 1 ? 8 : len;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const bytes = randomBytes(n);
    for (let i = 0; i < n; i++) result += chars[bytes[i]! % chars.length];
    return result;
  }

  if (key.startsWith('ENV')) {
    const colonIdx = name.indexOf(':');
    if (colonIdx >= 0) {
      return process.env[name.slice(colonIdx + 1)] ?? undefined;
    }
    return undefined;
  }

  return undefined;
}

export function substConfigVars(value: string, context?: Record<string, string>): string {
  const ESC_BS = '\x01';
  const ESC_VAR = '\x02';
  const innermost = /\$\{([^{}]*)\}/g;

  let result = value;
  result = result.replace(/\\\\/g, ESC_BS);
  result = result.replace(/\\\$\{/g, ESC_VAR);

  while (true) {
    const prev = result;
    result = result.replace(innermost, (_match: string, inner: string) => {
      const expanded = resolveVar(inner, context);
      if (expanded !== undefined) return expanded;
      return _match;
    });
    if (result === prev) break;
  }

  result = result.replace(/\x02/g, '${');
  result = result.replace(/\x01/g, '\\');
  return result;
}

export function substConfigObject(
  obj: Record<string, unknown>,
  context?: Record<string, string>,
): Record<string, unknown> {

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      result[key] = substConfigVars(val, context);
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = substConfigObject(val as Record<string, unknown>, context);
    } else if (Array.isArray(val)) {
      result[key] = val.map(item => {
        if (typeof item === 'string') return substConfigVars(item, context);
        if (item !== null && typeof item === 'object') {
          return substConfigObject(item as Record<string, unknown>, context);
        }
        return item;
      });
    } else {
      result[key] = val;
    }
  }
  return result;
}
