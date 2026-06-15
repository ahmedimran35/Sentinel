import { Box, Text } from 'ink';
import { memo } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation } from '../hooks/use-animation.js';

export const ScrollbackIndicator = memo(function ScrollbackIndicator({ count }: { count: number }) {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 500 });

  if (count <= 0) return null;

  const arrow = frame % 2 === 0 ? '\u25B2' : '\u25B3';

  return (
    <Box justifyContent="center" marginBottom={1}>
      <Text color={theme.dim}>
        {arrow} {count} line{count !== 1 ? 's' : ''} above {arrow}
      </Text>
    </Box>
  );
});
