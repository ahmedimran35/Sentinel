import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface HeaderProps {
  projectName: string;
  isThinking: boolean;
}

const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

export const Header: FunctionComponent<HeaderProps> = ({ projectName, isThinking }) => {
  const spinner = isThinking ? SPINNER_FRAMES[Math.floor(Date.now() / 150) % SPINNER_FRAMES.length] : '·';

  return (
    <Box borderStyle="single" borderColor="#444" width="100%">
      <Box flexGrow={1}>
        <Text bold color="#d4a76a"> sentinel </Text>
        <Text dimColor> · </Text>
        <Text> {projectName} </Text>
      </Box>
      <Box>
        <Text> {spinner} {isThinking ? 'thinking…' : 'idle'} </Text>
      </Box>
    </Box>
  );
};
