import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const ESC_BS = '\x01';
const ESC_OPEN = '\x02';
const ESC_CLOSE = '\x03';

export function resolveConfigVars(value: string, configDir?: string): string {
  const innermost = /\{([^{}]*)\}/g;
  let result = value;
  result = result.replace(/\\\\/g, ESC_BS);
  result = result.replace(/\\\{/g, ESC_OPEN);
  result = result.replace(/\\\}/g, ESC_CLOSE);

  while (true) {
    const prev = result;
    result = result.replace(innermost, (_match: string, inner: string) => {
      const envMatch = inner.match(/^env:(.+)$/);
      if (envMatch) {
        return process.env[envMatch[1]!] ?? '';
      }
      const fileMatch = inner.match(/^file:(.+)$/);
      if (fileMatch) {
        const filePath = fileMatch[1]!;
        const absPath = isAbsolute(filePath) ? filePath : (configDir ? resolve(configDir, filePath) : resolve(filePath));
        try {
          return readFileSync(absPath, 'utf-8').replace(/\r?\n$/, '');
        } catch {
          return _match;
        }
      }
      return _match;
    });
    if (result === prev) break;
  }

  result = result.replace(/\x03/g, '}');
  result = result.replace(/\x02/g, '{');
  result = result.replace(/\x01/g, '\\');
  return result;
}

export function resolveConfigObject(
  obj: Record<string, unknown>,
  configDir?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      result[key] = resolveConfigVars(val, configDir);
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = resolveConfigObject(val as Record<string, unknown>, configDir);
    } else if (Array.isArray(val)) {
      result[key] = val.map(item => {
        if (typeof item === 'string') return resolveConfigVars(item, configDir);
        if (item !== null && typeof item === 'object') {
          return resolveConfigObject(item as Record<string, unknown>, configDir);
        }
        return item;
      });
    } else {
      result[key] = val;
    }
  }
  return result;
}
