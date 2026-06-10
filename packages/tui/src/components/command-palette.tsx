import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface CommandPaletteProps {
  onSelect: (commandKey: string) => void;
  onCancel: () => void;
}

const COMMANDS: Array<{ key: string; label: string; description: string }> = [
  { key: '/help', label: '/help', description: 'Show available commands' },
  { key: '/plan', label: '/plan', description: 'Generate a plan before acting' },
  { key: '/review', label: '/review', description: 'Review recent changes' },
  { key: '/test', label: '/test', description: 'Run tests for current project' },
  { key: '/debug', label: '/debug', description: 'Enter debug mode' },
  { key: '/cost', label: '/cost', description: 'Show session cost' },
  { key: '/clear', label: '/clear', description: 'Clear conversation history' },
  { key: '/exit', label: '/exit', description: 'Exit Sentinel' },
];

export const CommandPalette: FunctionComponent<CommandPaletteProps> = ({ onSelect: _, onCancel: __ }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#d4a76a" paddingX={1}>
      <Box>
        <Text dimColor>command: </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {COMMANDS.map((cmd) => (
          <Box key={cmd.key}>
            <Text>
              <Text bold>{cmd.key}</Text>
              {'  '}
              <Text dimColor>{cmd.description}</Text>
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
