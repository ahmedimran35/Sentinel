import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import type { Particle } from '../hooks/use-particle-system.js';

interface ParticleDustProps {
  particles: Particle[];
  width: number;
}

const COLOR_MAP: Record<string, string> = {
  brand: '#a855f7',
  info: '#38bdf8',
  success: '#34d399',
  warning: '#fbbf24',
  dim: '#787c99',
};

export const ParticleDust: FunctionComponent<ParticleDustProps> = ({ particles, width }) => {
  const theme = useTheme();
  const visible = particles.slice(0, Math.min(particles.length, width));
  const density = Math.min(visible.length, width);

  return (
    <Box height={1}>
      {Array.from({ length: density }, (_, i) => {
        const p = visible[i];
        if (!p) return <Text key={i}> </Text>;
        const color = COLOR_MAP[p.color] ?? theme.dim;
        return <Text key={`${p.id}`} color={color}>{p.char}</Text>;
      })}
    </Box>
  );
};
