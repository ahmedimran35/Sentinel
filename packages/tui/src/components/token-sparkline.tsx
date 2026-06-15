import { Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';

interface TokenSparklineProps {
  history: number[];
  width?: number;
}

const SPARK_CHARS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

export const TokenSparkline = memo(({ history, width = 10 }: TokenSparklineProps) => {
  const theme = useTheme();

  if (history.length === 0) return null;

  const recent = history.slice(-width);
  const max = Math.max(...recent, 1);
  const bars = recent.map((v) => {
    const idx = Math.round((v / max) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx] ?? SPARK_CHARS[0]!;
  });

  return (
    <Text color={theme.dim}>
      {bars.join('')}
    </Text>
  );
});

interface MiniCtxBarProps {
  used: number;
  max: number;
  width?: number;
}

export const MiniCtxBar = memo(({ used, max, width = 6 }: MiniCtxBarProps) => {
  const theme = useTheme();
  const ratio = max > 0 ? used / max : 0;
  const fill = Math.round(ratio * width);
  const color = ratio > 0.9 ? theme.error : ratio > 0.7 ? theme.warning : theme.success;

  return (
    <Text color={color}>
      {'\u2588'.repeat(fill)}{'\u2591'.repeat(Math.max(0, width - fill))}
    </Text>
  );
});
