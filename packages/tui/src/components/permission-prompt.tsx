import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface PermissionPromptProps {
  action: string;
  risk: string;
  onResponse: (response: 'y' | 'a' | 'n' | 'd') => void;
}

export const PermissionPrompt: FunctionComponent<PermissionPromptProps> = ({ action, risk, onResponse: _onResponse }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#e5c07b" marginY={1} paddingX={1}>
      <Box>
        <Text bold color="#e5c07b"> Permission Required</Text>
      </Box>
      <Box>
        <Text dimColor>Action: </Text>
        <Text>{action}</Text>
      </Box>
      <Box>
        <Text dimColor>Risk: </Text>
        <Text color="#e5c07b">{risk}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          {'  '}[<Text color="#98c379">y</Text>] yes  [<Text color="#98c379">a</Text>] always  [<Text color="#e06c75">n</Text>] no  [<Text color="#61afef">d</Text>] diff
        </Text>
      </Box>
    </Box>
  );
};
