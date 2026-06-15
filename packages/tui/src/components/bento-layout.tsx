import { Box, useStdout } from 'ink';
import type { FunctionComponent, ReactNode } from 'react';

export type LayoutMode = 'compact' | 'normal' | 'bento';

export interface BentoLayoutProps {
  main: ReactNode;
  sidebar?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
}

export function useLayoutMode(): LayoutMode {
  const { stdout } = useStdout();
  const cols = stdout.columns ?? 80;
  if (cols < 80) return 'compact';
  if (cols >= 160) return 'bento';
  return 'normal';
}

export const BentoLayout: FunctionComponent<BentoLayoutProps> = ({ main, sidebar, toolbar, footer }) => {
  const mode = useLayoutMode();

  if (mode === 'compact') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        {toolbar}
        <Box flexGrow={1} flexDirection="column">
          {main}
          {sidebar}
        </Box>
        {footer}
      </Box>
    );
  }

  if (mode === 'bento') {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        {toolbar}
        <Box flexGrow={1} flexDirection="row" width="100%">
          <Box flexGrow={1} flexDirection="column">
            {main}
          </Box>
          {sidebar && (
            <Box width={40} marginLeft={1} flexDirection="column">
              {sidebar}
            </Box>
          )}
        </Box>
        {footer}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {toolbar}
      <Box flexGrow={1} flexDirection="column">
        {main}
      </Box>
      {footer}
    </Box>
  );
};
