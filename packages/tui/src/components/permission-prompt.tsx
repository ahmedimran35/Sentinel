import { Box, Text, useInput } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';

interface PermissionPromptProps {
  action: string;
  risk: string;
  onResponse: (response: 'y' | 'a' | 'n' | 'd') => void;
}

export const PermissionPrompt: FunctionComponent<PermissionPromptProps> = ({ action, risk, onResponse }) => {
  const theme = useTheme();
  useInput((_input, key) => {
    if (key.ctrl && key.return) return;
    if (_input === 'y') onResponse('y');
    else if (_input === 'a') onResponse('a');
    else if (_input === 'n') onResponse('n');
    else if (_input === 'd') onResponse('d');
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.warning} marginY={1} paddingX={1}>
      <Box>
        <Text bold color={theme.warning}> Permission Required</Text>
      </Box>
      <Box>
        <Text dimColor>Action: </Text>
        <Text>{action}</Text>
      </Box>
      <Box>
        <Text dimColor>Risk: </Text>
        <Text color={theme.warning}>{risk}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          {'  '}[<Text color={theme.success}>y</Text>] yes  [<Text color={theme.success}>a</Text>] always  [<Text color={theme.error}>n</Text>] no  [<Text color={theme.info}>d</Text>] diff
        </Text>
      </Box>
    </Box>
  );
};
