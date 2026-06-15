import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation, useSpinner } from '../hooks/use-animation.js';

interface ThinkingIndicatorProps {
  isThinking: boolean;
}

const PHASES = [
  { label: 'connect', color: '#60a5fa', icon: '\u25C9' },
  { label: 'analyze', color: '#c084fc', icon: '\u25B6' },
  { label: 'reason', color: '#f472b6', icon: '\u25C8' },
  { label: 'generate', color: '#34d399', icon: '\u25B3' },
];

const SPINNER = ['◐', '◓', '◑', '◒'];

const GLOW_FRAMES = [
  '\u2591\u2591\u2591',
  '\u2592\u2591\u2591',
  '\u2593\u2592\u2591',
  '\u2593\u2593\u2592',
  '\u2588\u2593\u2593',
  '\u2593\u2593\u2592',
  '\u2593\u2592\u2591',
  '\u2592\u2591\u2591',
];

export const ThinkingIndicator: FunctionComponent<ThinkingIndicatorProps> = ({ isThinking }) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 800, isActive: isThinking });
  const activePhase = frame % PHASES.length;
  const spinner = useSpinner(SPINNER, 150, isThinking);
  const glowIdx = Math.floor(frame / 2) % GLOW_FRAMES.length;
  const glow = GLOW_FRAMES[glowIdx] ?? GLOW_FRAMES[0]!;

  if (!isThinking) return null;

  const activePhaseClr = PHASES[activePhase]?.color ?? theme.brand;

  return (
    <Box marginLeft={2} marginTop={1} flexDirection="column" gap={1}>
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        <Box>
          <Text color={activePhaseClr}>{glow}</Text>
        </Box>
        <Box alignItems="center" gap={1}>
          {PHASES.map((phase, i) => {
            const done = i < activePhase;
            const active = i === activePhase;
            const clr = done ? '#34d399' : active ? phase.color : theme.muted;
            const icon = done ? '\u2713' : active ? spinner : '\u25CB';
            return (
              <Box key={i} alignItems="center" gap={0}>
                <Text color={clr}>{icon}</Text>
                <Text color={clr}>{phase.label}</Text>
                {i < PHASES.length - 1 && <Text color={theme.muted}> </Text>}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>{'\u2501'.repeat(Math.min((frame * 3) % 30, 20))}</Text>
        </Box>
        <Box>
          <Text color={activePhaseClr}>{glow.split('').reverse().join('')}</Text>
        </Box>
      </Box>
    </Box>
  );
};
