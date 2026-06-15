import { Box, Text } from 'ink';
import { memo, useMemo } from 'react';
import { useTheme } from '../theme-context.js';

export interface FileDiagnostic {
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string;
}

interface LSPDiagnosticsProps {
  diagnostics: FileDiagnostic[];
  activeFile?: string;
  maxItems?: number;
  onJump?: (file: string, line: number) => void;
}

const SEVERITY_ICON: Record<string, string> = {
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
  hint: '\u25CB',
};

const SEVERITY_COLOR: Record<string, keyof typeof themeForColor> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'dim',
};

interface ThemeLike {
  error: string;
  warning: string;
  info: string;
  dim: string;
  text: string;
  border: string;
}
const themeForColor = {} as ThemeLike;

function groupByFile(diags: FileDiagnostic[]): Map<string, FileDiagnostic[]> {
  const groups = new Map<string, FileDiagnostic[]>();
  for (const d of diags) {
    const existing = groups.get(d.filePath);
    if (existing) existing.push(d);
    else groups.set(d.filePath, [d]);
  }
  return groups;
}

export const LSPDiagnostics = memo(({ diagnostics, activeFile, maxItems = 20 }: LSPDiagnosticsProps) => {
  const theme = useTheme();
  const grouped = useMemo(() => groupByFile(diagnostics), [diagnostics]);
  const sorted = useMemo(() => {
    const entries = Array.from(grouped.entries());
    if (activeFile) {
      entries.sort(([a], [b]) => {
        if (a === activeFile) return -1;
        if (b === activeFile) return 1;
        return a.localeCompare(b);
      });
    }
    return entries;
  }, [grouped, activeFile]);

  const totalErrors = diagnostics.filter(d => d.severity === 'error').length;
  const totalWarnings = diagnostics.filter(d => d.severity === 'warning').length;

  if (diagnostics.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
        <Text dimColor>No diagnostics</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
      <Box marginBottom={1} gap={1}>
        <Text bold color={theme.text}>Diagnostics</Text>
        {totalErrors > 0 && <Text color={theme.error}>{'\u2717'} {totalErrors}</Text>}
        {totalWarnings > 0 && <Text color={theme.warning}>{'\u26A0'} {totalWarnings}</Text>}
        <Text dimColor>{diagnostics.length} total</Text>
      </Box>
      <Box flexDirection="column" width="100%">
        {sorted.slice(0, maxItems).map(([filePath, diags]) => {
          const isActive = filePath === activeFile;
          return (
            <Box key={filePath} flexDirection="column" width="100%">
              <Box
                gap={1}
                backgroundColor={isActive ? theme.info + '20' : undefined}
              >
                <Text dimColor>{'\u25B6'}</Text>
                <Text bold color={theme.text}>{filePath.split('/').pop() ?? filePath}</Text>
                <Text dimColor wrap="truncate">{filePath}</Text>
                <Text dimColor>({diags.length})</Text>
              </Box>
              {diags.slice(0, 5).map((d, i) => {
                const sevColorKey = SEVERITY_COLOR[d.severity] as keyof ThemeLike;
                const sevColor = theme[sevColorKey] ?? theme.dim;
                return (
                  <Box key={`${d.filePath}:${d.line}:${i}`} paddingLeft={2} gap={1}>
                    <Text color={sevColor}>{SEVERITY_ICON[d.severity]}</Text>
                    <Text dimColor>{d.line}:{d.column}</Text>
                    <Text color={theme.text} wrap="truncate">{d.message}</Text>
                    {d.code && <Text dimColor>({d.code})</Text>}
                  </Box>
                );
              })}
              {diags.length > 5 && (
                <Text dimColor>  ... {diags.length - 5} more</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
