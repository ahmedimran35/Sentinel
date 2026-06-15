import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
  onDismiss?: () => void;
}

export const Toast: FunctionComponent<ToastProps> = ({ message, type = 'info', durationMs = 3000, onDismiss }) => {
  const theme = useTheme();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  if (!visible) return null;

  const colors: Record<string, string> = {
    info: theme.info,
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
  };

  return (
    <Box>
      <Text color={colors[type]}>{message}</Text>
    </Box>
  );
};
