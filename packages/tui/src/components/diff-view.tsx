import { Box, Text, useStdout } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';
import type { DiffStyle } from '../tui-config.js';

interface DiffLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
}

interface DiffViewProps {
  diff: string;
  fullScreen?: boolean;
  diffStyle?: DiffStyle;
}

function parseDiff(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ type: 'add', content: line });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ type: 'del', content: line });
    } else {
      lines.push({ type: 'ctx', content: line });
    }
  }
  return lines;
}

export const DiffView = memo(({ diff, fullScreen, diffStyle = 'auto' }: DiffViewProps) => {
  const theme = useTheme();
  const { stdout } = useStdout();
  const parsed = parseDiff(diff);
  const maxLines = fullScreen ? parsed.length : Math.min(parsed.length, 20);
  const { frame } = useAnimation({ interval: 30 });
  const revealCount = Math.min(frame, maxLines);
  const terminalWidth = stdout.columns ?? 80;
  const useStacked = diffStyle === 'stacked' || (diffStyle === 'auto' && terminalWidth < 100);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} marginLeft={useStacked ? 0 : 2} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.info}>{'\u25B3'} diff</Text>
        <Text dimColor> {parsed.length} lines</Text>
      </Box>
      {parsed.slice(0, revealCount).map((line, i) => (
        <Box key={i}>
          {line.type === 'add' ? (
            <Box>
              <Text color={theme.diffAddBg}>{'\u2502'}</Text>
              <Text color={theme.diffAdd}>{line.content}</Text>
            </Box>
          ) : line.type === 'del' ? (
            <Box>
              <Text color={theme.diffDelBg}>{'\u2502'}</Text>
              <Text color={theme.diffDel}>{line.content}</Text>
            </Box>
          ) : (
            <Box>
              <Text dimColor>{'\u2502'}</Text>
              <Text dimColor>{line.content}</Text>
            </Box>
          )}
        </Box>
      ))}
      {revealCount < maxLines && (
        <Box>
          <Text color={theme.brand}>{'\u25CB'}</Text>
          <Text dimColor> revealing...</Text>
        </Box>
      )}
      {revealCount >= maxLines && !fullScreen && parsed.length > 20 && (
        <Text dimColor>... {parsed.length - 20} more lines</Text>
      )}
    </Box>
  );
});
