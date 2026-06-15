import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export function loadIgnorePatterns(projectRoot: string): string[] {
  const patterns: string[] = [];
  for (const name of ['.ignore', '.gitignore']) {
    const fp = join(projectRoot, name);
    if (existsSync(fp)) {
      const content = readFileSync(fp, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          patterns.push(trimmed);
        }
      }
    }
  }
  return patterns;
}

export function shouldIgnore(filePath: string, patterns: string[], cwd: string): boolean {
  const relPath = relative(cwd, filePath);
  if (!relPath || relPath.startsWith('..')) return false;

  let ignored = false;
  for (const pattern of patterns) {
    let negate = false;
    let p = pattern;
    if (p.startsWith('!')) {
      negate = true;
      p = p.slice(1);
    }
    if (matchPattern(relPath, p)) {
      ignored = !negate;
    }
  }
  return ignored;
}

function matchPattern(relPath: string, pattern: string): boolean {
  const dirOnly = pattern.endsWith('/');
  let p = dirOnly ? pattern.slice(0, -1) : pattern;
  const anchored = p.startsWith('/');
  if (anchored) p = p.slice(1);
  const hasSlash = p.includes('/');

  let reStr = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === '*' && i + 1 < p.length && p[i + 1] === '*') {
      reStr += '.*';
      i++;
    } else if (ch === '*') {
      reStr += '[^/]*';
    } else if (ch === '?') {
      reStr += '[^/]';
    } else if ('.+^${}()|\\[]'.includes(ch)) {
      reStr += '\\' + ch;
    } else {
      reStr += ch;
    }
  }

  const suffix = '(/.*)?$';

  if (!hasSlash && !anchored) {
    return new RegExp(`(^|/)${reStr}${suffix}`).test(relPath);
  }

  return new RegExp(`^${reStr}${suffix}`).test(relPath);
}
