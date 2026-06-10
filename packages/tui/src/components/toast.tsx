import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
  onDismiss?: () => void;
}

export const Toast: FunctionComponent<ToastProps> = ({ message, type = 'info', durationMs = 3000, onDismiss }) => {
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
    info: '#61afef',
    success: '#7ecf7e',
    warning: '#e5c07b',
    error: '#e06c75',
  };

  return (
    <Box>
      <Text color={colors[type]}>{message}</Text>
    </Box>
  );
};
