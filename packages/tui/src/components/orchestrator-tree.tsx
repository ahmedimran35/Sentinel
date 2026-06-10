import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';

interface Node {
  role: string;
  status: 'running' | 'done' | 'error' | 'pending';
  detail?: string;
  children?: Node[];
}

interface OrchestratorTreeProps {
  nodes: Node[];
}

const TreeNode: FunctionComponent<{ node: Node; depth: number }> = ({ node, depth }) => {
  const statusSymbol = {
    running: ' ◐',
    done: ' ✓',
    error: ' ✗',
    pending: ' ·',
  }[node.status];

  const statusColor = {
    running: '#61afef',
    done: '#98c379',
    error: '#e06c75',
    pending: '#555',
  }[node.status];

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{'  '.repeat(depth)}</Text>
        <Text color={statusColor}>{statusSymbol} </Text>
        <Text bold color={statusColor}>{node.role}</Text>
        {node.detail && <Text dimColor> · {node.detail}</Text>}
      </Box>
      {node.children?.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </Box>
  );
};

export const OrchestratorTree: FunctionComponent<OrchestratorTreeProps> = ({ nodes }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#444" paddingX={1}>
      <Text dimColor> orchestrator</Text>
      {nodes.map((node, i) => (
        <TreeNode key={i} node={node} depth={0} />
      ))}
    </Box>
  );
};
