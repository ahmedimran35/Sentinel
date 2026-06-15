import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Theme } from './theme.js';
import { themes as builtinThemes } from './theme.js';

interface ThemeDefs {
  [key: string]: string | { dark: string; light: string };
}

interface ThemeFile {
  defs?: ThemeDefs;
  theme: ThemeDefs;
}

function resolveColor(
  value: string | { dark: string; light: string } | undefined,
  defs: ThemeDefs,
  variant: 'dark' | 'light',
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    if (value === 'none') return 'none';
    if (/^\d{1,3}$/.test(value)) return value;
    if (defs[value] !== undefined) return resolveColor(defs[value], defs, variant);
    return value;
  }
  if (typeof value === 'object') {
    return resolveColor(value[variant] ?? value.dark, defs, variant);
  }
  return undefined;
}

function isValidColor(value: string): boolean {
  if (value === 'none') return true;
  if (/^\d{1,3}$/.test(value)) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  if (/^[a-zA-Z]+$/.test(value) && value.length < 30) return true;
  return false;
}

const THEME_KEYS: (keyof Theme)[] = [
  'brand', 'user', 'text', 'dim', 'muted', 'success', 'warning', 'error', 'info',
  'diffAdd', 'diffDel', 'diffAddBg', 'diffDelBg', 'border', 'borderFocus',
  'background', 'backgroundPanel', 'backgroundElement', 'borderSubtle',
  'diffContext', 'diffHunkHeader', 'diffHighlightAdd', 'diffHighlightDel',
  'diffContextBg', 'diffLineNumber', 'diffAddLineNumberBg', 'diffDelLineNumberBg',
  'markdownText', 'markdownHeading', 'markdownLink', 'markdownLinkText',
  'markdownCode', 'markdownBlockQuote', 'markdownEmph', 'markdownStrong',
  'markdownHorizontalRule', 'markdownListItem', 'markdownListEnumeration',
  'markdownImage', 'markdownImageText', 'markdownCodeBlock',
  'syntaxVariable', 'syntaxOperator', 'syntaxPunctuation',
];

const MODE_BADGE_KEYS: (keyof Theme['modeBadge'])[] = ['plan', 'build', 'auto', 'yolo'];
const SYNTAX_KEYS: (keyof Theme['syntax'])[] = ['keyword', 'string', 'number', 'comment', 'function', 'type'];

function parseTheme(_name: string, data: ThemeFile, variant: 'dark' | 'light'): Theme | null {
  const defs: ThemeDefs = data.defs ?? {};
  const themeData = data.theme;

  const modeBadgeRaw = themeData['modeBadge'];
  const syntaxRaw = themeData['syntax'];

  const out: Record<string, unknown> = {};

  for (const key of THEME_KEYS) {
    const raw = themeData[key];
    const resolved = resolveColor(raw as string | { dark: string; light: string } | undefined, defs, variant);
    if (resolved !== undefined && (resolved === 'none' || resolved === '' || isValidColor(resolved))) {
      out[key] = resolved;
    }
  }

  const modeBadge: Record<string, string> = {};
  for (const key of MODE_BADGE_KEYS) {
    if (modeBadgeRaw && typeof modeBadgeRaw === 'object') {
      const raw = (modeBadgeRaw as Record<string, unknown>)[key];
      const resolved = resolveColor(
        raw as string | { dark: string; light: string } | undefined,
        defs,
        variant,
      );
      if (resolved !== undefined) modeBadge[key] = resolved;
    }
  }
  if (Object.keys(modeBadge).length > 0) out['modeBadge'] = modeBadge;

  const syntax: Record<string, string> = {};
  for (const key of SYNTAX_KEYS) {
    if (syntaxRaw && typeof syntaxRaw === 'object') {
      const raw = (syntaxRaw as Record<string, unknown>)[key];
      const resolved = resolveColor(
        raw as string | { dark: string; light: string } | undefined,
        defs,
        variant,
      );
      if (resolved !== undefined) syntax[key] = resolved;
    }
  }
  if (Object.keys(syntax).length > 0) out['syntax'] = syntax;

  return out as unknown as Theme;
}

function loadThemeFiles(directory: string): Record<string, ThemeFile> {
  const result: Record<string, ThemeFile> = {};
  if (!existsSync(directory)) return result;

  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      try {
        const filePath = join(directory, entry.name);
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content) as ThemeFile;
        if (parsed.theme && typeof parsed.theme === 'object') {
          const name = entry.name.replace(/\.json$/, '');
          result[name] = parsed;
        }
      } catch {
        // skip invalid files
      }
    }
  }
  return result;
}

export interface LoadCustomThemesOptions {
  variant?: 'dark' | 'light';
  themeDirs?: string[];
}

export function loadCustomThemes(options?: LoadCustomThemesOptions): Record<string, Theme> {
  const variant = options?.variant ?? 'dark';
  const result: Record<string, Theme> = { ...builtinThemes };

  const dirs = options?.themeDirs ?? [
    join(homedir(), '.config', 'sentinel', 'themes'),
    resolve(process.cwd(), '.opencode', 'themes'),
  ];

  for (const dir of dirs) {
    const themeFiles = loadThemeFiles(dir);
    for (const [name, data] of Object.entries(themeFiles)) {
      const theme = parseTheme(name, data, variant);
      if (theme) {
        result[name] = theme;
      }
    }
  }

  return result;
}
