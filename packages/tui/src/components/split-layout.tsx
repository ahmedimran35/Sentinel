import { Box, Text, useStdout } from 'ink';
import { useState, type FunctionComponent, type ReactNode } from 'react';
import { useTheme } from '../theme-context.js';

export type PaneDirection = 'horizontal' | 'vertical';

export interface PaneConfig {
  id: string;
  label: string;
  content: ReactNode;
  minSize: number;
  defaultSize: number;
}

interface SplitLayoutProps {
  panes: PaneConfig[];
  direction?: PaneDirection;
  dividerSize?: number;
}

export const SplitLayout: FunctionComponent<SplitLayoutProps> = ({
  panes,
  direction = 'horizontal',
  dividerSize = 1,
}) => {
  const theme = useTheme();
  const { stdout } = useStdout();
  const totalSize = direction === 'horizontal' ? (stdout.columns ?? 80) : (stdout.rows ?? 24);
  const [sizes] = useState<number[]>(() => {
    const auto = panes.map(p => p.defaultSize);
    const sum = auto.reduce((a, b) => a + b, 0);
    if (sum > totalSize - (panes.length - 1) * dividerSize) {
      const scale = (totalSize - (panes.length - 1) * dividerSize) / sum;
      return auto.map(s => Math.round(s * scale));
    }
    return auto;
  });
  const [activePane] = useState(0);

  const isHorizontal = direction === 'horizontal';

  const paneElements = panes.map((pane, i) => {
    const isLast = i === panes.length - 1;
    const size = sizes[i] ?? pane.defaultSize;

    return (
      <Box key={pane.id} flexDirection="column" flexGrow={0} width={isHorizontal ? size : undefined} height={!isHorizontal ? size : undefined}>
        <Box flexDirection="row" alignItems="center" paddingX={1} gap={1}>
          <Box width={1} height={1} backgroundColor={i === activePane ? theme.brand : theme.dim} />
          <Text bold color={i === activePane ? theme.brand : theme.dim}>{pane.label}</Text>
          {i > 0 && (
            <Text dimColor> {'\u2190'} resize</Text>
          )}
        </Box>
        <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={i === activePane ? theme.brand : theme.border}>
          {pane.content}
        </Box>
        {!isLast && (
          <Box width={dividerSize} backgroundColor={theme.border}>
            <Text color={theme.dim}>{isHorizontal ? '\u2502' : '\u2500'}</Text>
          </Box>
        )}
      </Box>
    );
  });

  return (
    <Box flexDirection={isHorizontal ? 'row' : 'column'} width="100%" height="100%">
      {paneElements}
    </Box>
  );
};
