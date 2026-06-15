import { Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

interface LiveTokenCounterProps {
  target: number;
  isActive?: boolean;
  label?: string;
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export const LiveTokenCounter: FunctionComponent<LiveTokenCounterProps> = ({ target, isActive = true, label = 'tok' }) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 60, isActive });

  if (!isActive) {
    return (
      <Text color={theme.dim}>
        {formatNumber(target)} {label}
      </Text>
    );
  }

  const displayTarget = Math.max(target, 0);
  const numStr = String(displayTarget);
  const isRolling = frame < 20;

  if (!isRolling) {
    return (
      <Text color={theme.info}>
        +{formatNumber(displayTarget)} {label}
      </Text>
    );
  }

  const digits = numStr.split('').map((d) => {
    if (frame < 15 && Math.random() > 0.4) {
      return String(Math.floor(Math.random() * 10));
    }
    return d;
  });

  return (
    <Text color={theme.brand}>
      +{digits.join('')} {label}
    </Text>
  );
};
