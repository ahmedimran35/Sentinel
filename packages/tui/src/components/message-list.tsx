import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import type { SentinelEvent } from '@sentinel/sdk';

interface MessageListProps {
  events: SentinelEvent[];
}

export const UserMessage: FunctionComponent<{ content: string }> = ({ content }) => {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="#6a9fb5" bold> ▌ You</Text>
      </Box>
      <Box marginLeft={2}>
        <Text>{content}</Text>
      </Box>
    </Box>
  );
};

export const AssistantMessage: FunctionComponent<{ content: string }> = ({ content }) => {
  if (!content) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="#d4a76a" bold> ▌ Sentinel</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text>{content}</Text>
      </Box>
    </Box>
  );
};

type ToolResultShape = { output: string; isError: boolean };

export const ToolCallCard: FunctionComponent<{
  name: string;
  args: string;
  result?: ToolResultShape;
}> = ({ name, args }) => {
  return (
    <Box marginLeft={2} flexDirection="column">
      <Box>
        <Text dimColor> ⏺ </Text>
        <Text>{name} </Text>
        <Text dimColor>{args.length > 60 ? args.slice(0, 60) + '…' : args}</Text>
      </Box>
    </Box>
  );
};

export const MessageList: FunctionComponent<MessageListProps> = ({ events }) => {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {events.map((e, i) => {
        if (e.type === 'text_delta') {
          return <AssistantMessage key={i} content={e.delta} />;
        }
        return null;
      })}
    </Box>
  );
};
