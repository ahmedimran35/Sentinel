import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import type { Ripple } from '../hooks/use-ripple.js';

interface RippleEffectProps {
  ripples: Ripple[];
}

const RIPPLE_CHARS = ['\u00B7', '\u25CB', '\u25D9', '\u25D8', '\u25C9', '\u25CE'];

export const RippleEffect: FunctionComponent<RippleEffectProps> = ({ ripples }) => {
  if (ripples.length === 0) return null;

  return (
    <Box height={1} justifyContent="center">
      {ripples.slice(-3).map((r) => {
        const progress = r.radius / r.maxRadius;
        const charIndex = Math.min(Math.floor(progress * RIPPLE_CHARS.length), RIPPLE_CHARS.length - 1);
        const char = RIPPLE_CHARS[charIndex] ?? RIPPLE_CHARS[RIPPLE_CHARS.length - 1]!;

        return (
          <Text key={r.id} color={r.color}>
            {char}
          </Text>
        );
      })}
    </Box>
  );
};
