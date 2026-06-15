import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

interface StatusBarProps {
  modelName: string;
  mode: 'plan' | 'build' | 'auto' | 'yolo';
  contextUsed: number;
  contextMax: number;
}

function formatCtx(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

function AnimatedCtxBar({ used, max }: { used: number; max: number }) {
  const theme = useTheme();
  const ratio = max > 0 ? used / max : 0;
  const barW = 12;
  const fill = Math.round(ratio * barW);
  const empty = barW - fill;
  const color = ratio > 0.9 ? theme.error : ratio > 0.7 ? theme.warning : theme.success;

  return (
    <Box>
      <Text color={theme.dim}>ctx </Text>
      <Text color={color}>{'\u2588'.repeat(fill)}{'\u2591'.repeat(empty)}</Text>
      <Text color={theme.dim}> {formatCtx(used)}/{formatCtx(max)}</Text>
    </Box>
  );
}

export const StatusBar = memo(({ modelName, mode, contextUsed, contextMax }: StatusBarProps) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 300 });
  const modeColor = theme.modeBadge[mode] ?? theme.dim;
  const modeIcon = mode === 'plan' ? '\u25CB' : mode === 'build' ? '\u25B3' : mode === 'auto' ? '\u25C9' : '\u2606';
  const dataDot = frame % 2 === 0 ? '\u25CF' : '\u25CB';

  return (
    <Box borderStyle="round" borderColor={theme.border} width="100%" paddingX={1}>
      <Box flexGrow={1} alignItems="center" gap={1}>
        <Text color={theme.brand}>{dataDot}</Text>
        <Text color={theme.text}>{modelName}</Text>
        <Text color={theme.dim}>|</Text>
        <Text bold color={modeColor}>{modeIcon} {mode.toUpperCase()}</Text>
      </Box>
      <Box alignItems="center" gap={1}>
        <AnimatedCtxBar used={contextUsed} max={contextMax} />
        <Text color={theme.dim}>|</Text>
        <Text color={theme.dim}>{'\u23CE'}</Text>
        <Text dimColor>send</Text>
        <Text color={theme.dim}>{'\u238B'}</Text>
        <Text dimColor>int</Text>
      </Box>
    </Box>
  );
});
