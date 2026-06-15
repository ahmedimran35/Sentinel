import { Box, Text, useStdout } from 'ink';
import { memo, useMemo } from 'react';
import { useTheme } from '../theme-context.js';

interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'hunk';
  text: string;
  oldNum?: number;
  newNum?: number;
}

interface SideBySideDiffProps {
  diff: string;
  maxLines?: number;
}

function parseUnifiedDiff(diffText: string): { oldStart: number; newStart: number; lines: DiffLine[] } {
  const lines: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const raw of diffText.split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNum = parseInt(m[1]!, 10);
        newNum = parseInt(m[2]!, 10);
      }
      lines.push({ type: 'hunk', text: line });
      continue;
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      continue;
    }
    if (line.startsWith('+')) {
      lines.push({ type: 'add', text: line.slice(1), newNum, oldNum });
      newNum++;
    } else if (line.startsWith('-')) {
      lines.push({ type: 'del', text: line.slice(1), oldNum, newNum });
      oldNum++;
    } else {
      lines.push({ type: 'ctx', text: line, oldNum, newNum });
      oldNum++;
      newNum++;
    }
  }

  return { oldStart: 0, newStart: 0, lines: [{ type: 'ctx', text: '' }, ...lines] };
}

function computeSideBySide(
  parsed: { lines: DiffLine[] },
): { left: (DiffLine | null)[]; right: (DiffLine | null)[] } {
  const left: (DiffLine | null)[] = [];
  const right: (DiffLine | null)[] = [];

  for (const line of parsed.lines) {
    if (line.type === 'hunk') {
      left.push(line);
      right.push(line);
      continue;
    }
    if (line.type === 'add') {
      left.push(null);
      right.push(line);
    } else if (line.type === 'del') {
      left.push(line);
      right.push(null);
    } else {
      left.push(line);
      right.push(line);
    }
  }

  return { left, right };
}

function renderText(text: string, w: number): string {
  if (text.length > w) return text.slice(0, w - 1) + '\u2026';
  return text.padEnd(w);
}

export const SideBySideDiff = memo(({ diff, maxLines = 40 }: SideBySideDiffProps) => {
  const theme = useTheme();
  const { stdout } = useStdout();
  const terminalWidth = stdout.columns ?? 80;
  const colW = Math.max(30, Math.floor((terminalWidth - 6) / 2) - 2);
  const totalLines = diff.split('\n').length;

  const parsed = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const sbs = useMemo(() => computeSideBySide(parsed), [parsed]);
  const maxVisible = Math.max(10, Math.min(maxLines, terminalWidth > 100 ? 60 : 30));

  const truncated = sbs.left.length > maxVisible;

  const visibleLeft = sbs.left.slice(0, truncated ? maxVisible : undefined);
  const visibleRight = sbs.right.slice(0, truncated ? maxVisible : undefined);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Box marginBottom={1} gap={2}>
        <Text color={theme.diffDel}>[-] old</Text>
        <Text color={theme.diffAdd}>[+] new</Text>
        <Text dimColor>{totalLines} lines</Text>
      </Box>
      <Box flexDirection="row" width="100%" gap={1}>
        <Box flexDirection="column" width={colW + 2}>
          {visibleLeft.map((line, i) => {
            if (line === null) return <Box key={i} height={1} />;
            if (line.type === 'hunk') return <Text key={i} dimColor wrap="truncate">{line.text}</Text>;
            return (
              <Box key={i} height={1} backgroundColor={line.type === 'del' ? theme.diffDelBg : undefined}>
                <Text color={line.type === 'del' ? theme.diffDel : theme.dim}>
                  {renderText(line.text, colW)}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box width={1} backgroundColor={theme.border} />
        <Box flexDirection="column" width={colW + 2}>
          {visibleRight.map((line, i) => {
            if (line === null) return <Box key={i} height={1} />;
            if (line.type === 'hunk') return <Text key={i} dimColor wrap="truncate">{line.text}</Text>;
            return (
              <Box key={i} height={1} backgroundColor={line.type === 'add' ? theme.diffAddBg : undefined}>
                <Text color={line.type === 'add' ? theme.diffAdd : theme.dim}>
                  {renderText(line.text, colW)}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
      {truncated && (
        <Text dimColor>  ... {sbs.left.length - maxVisible} more lines</Text>
      )}
    </Box>
  );
});
