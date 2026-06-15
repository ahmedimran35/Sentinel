import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';

export interface ContextBreakdown {
  label: string;
  tokens: number;
  color: string;
}

interface ContextGaugeProps {
  used: number;
  max: number;
  breakdown?: ContextBreakdown[];
  width?: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

export const ContextGauge = memo(({ used, max, breakdown, width = 24 }: ContextGaugeProps) => {
  const theme = useTheme();
  const ratio = max > 0 ? used / max : 0;
  const barW = width;
  const barColor = ratio > 0.9 ? theme.error : ratio > 0.7 ? theme.warning : theme.success;

  if (breakdown && breakdown.length > 0) {
    const total = breakdown.reduce((s, b) => s + b.tokens, 0);
    const chars = breakdown.map(b => {
      const count = Math.max(1, Math.round((b.tokens / total) * barW));
      return { char: '\u2588'.repeat(count), color: b.color };
    });
    const fillStr = chars.map(c => c.char).join('').slice(0, barW);
    const emptyStr = '\u2591'.repeat(Math.max(0, barW - fillStr.length));

    return (
      <Box flexDirection="column" width="100%">
        <Box gap={1} marginBottom={1}>
          {breakdown.map(b => (
            <Box key={b.label} gap={1}>
              <Box width={1} height={1} backgroundColor={b.color} />
              <Text dimColor>{b.label}</Text>
              <Text dimColor>{fmt(b.tokens)}</Text>
            </Box>
          ))}
        </Box>
        <Box>
          <Text color={barColor}>{fillStr}{emptyStr}</Text>
          <Text dimColor>  {fmt(used)}/{fmt(max)}</Text>
        </Box>
      </Box>
    );
  }

  const fill = Math.round(ratio * barW);
  const empty = barW - fill;

  return (
    <Box>
      <Text color={barColor}>{'\u2588'.repeat(fill)}{'\u2591'.repeat(empty)}</Text>
      <Text dimColor>  {fmt(used)}/{fmt(max)} ({Math.round(ratio * 100)}%)</Text>
    </Box>
  );
});
