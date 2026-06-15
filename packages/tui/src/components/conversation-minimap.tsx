import { Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import type { ConversationEntry } from '../app.js';

interface ConversationMinimapProps {
  conversation: ConversationEntry[];
  height: number;
}

export const ConversationMinimap: FunctionComponent<ConversationMinimapProps> = ({ conversation, height }) => {
  const theme = useTheme();

  if (conversation.length === 0 || height < 2) return null;

  const step = Math.max(Math.floor(conversation.length / height), 1);
  const lines: string[] = [];

  for (let i = 0; i < height && i * step < conversation.length; i++) {
    const entry = conversation[i * step];
    if (!entry) {
      lines.push(' ');
      continue;
    }
    switch (entry.role) {
      case 'user':
        lines.push('\u25C9');
        break;
      case 'assistant':
        if (entry.tools && entry.tools.length > 0) lines.push('\u25B3');
        else lines.push('\u25CB');
        break;
      case 'diff':
        lines.push('\u2261');
        break;
      case 'error':
        lines.push('\u2717');
        break;
      default:
        lines.push('\u00B7');
    }
  }

  const colorMap: Record<string, string> = {
    user: theme.user,
    assistant: theme.brand,
    diff: theme.info,
    error: theme.error,
  };

  return (
    <Text>
      {lines.map((char, i) => {
        const entry = conversation[i * step];
        const color = entry ? colorMap[entry.role] ?? theme.dim : theme.dim;
        return <Text key={i} color={color}>{char}</Text>;
      })}
    </Text>
  );
};
