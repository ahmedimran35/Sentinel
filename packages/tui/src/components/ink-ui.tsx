import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';

interface BadgeProps {
  text: string;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';
  bold?: boolean;
}

export const Badge = memo(({ text, variant = 'default', bold = false }: BadgeProps) => {
  const theme = useTheme();
  const colorMap: Record<string, string> = {
    default: theme.dim,
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
    info: theme.info,
    brand: theme.brand,
  };
  const color = colorMap[variant] ?? theme.dim;

  return (
    <Text bold={bold} color={color} backgroundColor={color + '20'}>
      {' '}{text}{' '}
    </Text>
  );
});

interface ProgressBarProps {
  value: number;
  max: number;
  width?: number;
  label?: string;
  showPercent?: boolean;
}

export const ProgressBar = memo(({ value, max, width = 20, label, showPercent = true }: ProgressBarProps) => {
  const theme = useTheme();
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const fill = Math.round(ratio * width);
  const color = ratio > 0.9 ? theme.error : ratio > 0.7 ? theme.warning : theme.success;

  return (
    <Box gap={1}>
      {label && <Text dimColor>{label}</Text>}
      <Text color={color}>{'\u2588'.repeat(Math.max(0, fill))}{'\u2591'.repeat(Math.max(0, width - fill))}</Text>
      {showPercent && <Text dimColor>{Math.round(ratio * 100)}%</Text>}
    </Box>
  );
});

interface KeyHintProps {
  keys: string[];
  description: string;
}

export const KeyHint = memo(({ keys, description }: KeyHintProps) => {
  const theme = useTheme();
  return (
    <Box gap={1}>
      {keys.map(k => (
        <Text key={k} bold color={theme.brand} backgroundColor={theme.border}>{' '}{k}{' '}</Text>
      ))}
      <Text dimColor>{description}</Text>
    </Box>
  );
});
