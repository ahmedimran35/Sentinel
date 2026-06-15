import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

interface HeaderProps {
  projectName: string;
  sessionId?: string;
}

const LOGO_FRAMES = [
  '\u25C6 \u25C8  \u25CB \u25A3',
  ' \u25C6\u25C8  \u25CB\u25A3 ',
  '  \u25C6\u25C8\u25CB\u25A3  ',
  ' \u25A3\u25CB  \u25C8\u25C6 ',
  '\u25A3 \u25CB  \u25C8 \u25C6',
  ' \u25A3\u25CB  \u25C8\u25C6 ',
  '  \u25A3\u25CB\u25C8\u25C6  ',
  ' \u25C6\u25C8  \u25CB\u25A3 ',
];

export const Header = memo(({ projectName, sessionId }: HeaderProps) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 200 });

  return (
    <Box borderStyle="round" borderColor={theme.borderFocus} width="100%" paddingX={1}>
      <Box flexGrow={1} alignItems="center" gap={1}>
        <Text color={theme.brand}>{LOGO_FRAMES[frame % LOGO_FRAMES.length]}</Text>
        <Text bold color={theme.brand}>Sentinel</Text>
        <Text color={theme.dim}>/</Text>
        <Text color={theme.text}>{projectName}</Text>
        {sessionId && (
          <>
            <Text color={theme.dim}>:</Text>
            <Text dimColor>{sessionId.slice(0, 8)}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text color={theme.info}>v0.1.0</Text>
      </Box>
    </Box>
  );
});
