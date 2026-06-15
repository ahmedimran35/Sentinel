import { Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

interface BashFlameProps {
  isActive?: boolean;
  exitCode?: number;
}

const FLAME_FRAMES = [
  '\u2581\u2581\u2581\u2582\u2583\u2582\u2581\u2581',
  '\u2581\u2582\u2583\u2584\u2585\u2584\u2583\u2582',
  '\u2582\u2583\u2585\u2587\u2588\u2587\u2585\u2583',
  '\u2583\u2585\u2587\u2588\u2588\u2588\u2587\u2585',
  '\u2582\u2584\u2586\u2588\u2588\u2588\u2586\u2584',
  '\u2581\u2583\u2585\u2587\u2588\u2587\u2585\u2583',
  '\u2581\u2582\u2584\u2586\u2587\u2586\u2584\u2582',
  '\u2581\u2581\u2582\u2583\u2584\u2583\u2582\u2581',
];

export const BashFlame: FunctionComponent<BashFlameProps> = ({ isActive = true, exitCode }) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 100, isActive });

  if (!isActive && exitCode !== undefined) {
    const color = exitCode === 0 ? theme.success : theme.error;
    return (
      <Text color={color}>
        {exitCode === 0 ? '\u2713' : '\u2717'} exit {exitCode}
      </Text>
    );
  }

  if (!isActive) return null;

  const flame = FLAME_FRAMES[frame % FLAME_FRAMES.length];
  const intensity = Math.sin(frame * 0.2) * 0.3 + 0.7;
  const color = intensity > 0.85 ? theme.warning : theme.info;

  return <Text color={color}>{'\u25B3'} {flame}</Text>;
};
