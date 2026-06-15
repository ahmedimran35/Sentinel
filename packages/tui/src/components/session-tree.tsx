import { Box, Text } from 'ink';
import { memo, useState } from 'react';
import { useTheme } from '../theme-context.js';

export interface SessionNode {
  id: string;
  label: string;
  createdAt: number;
  parentId?: string;
  isCheckpoint?: boolean;
  isActive?: boolean;
  children?: SessionNode[];
}

interface SessionTreeProps {
  nodes: SessionNode[];
  activeId?: string;
  onSelect?: (id: string) => void;
  maxHeight?: number;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '\u2026';
}

const TreeNode = memo(({ node, depth, isActive, onSelect, collapsed, onToggle, activeId }: {
  node: SessionNode;
  depth: number;
  isActive: boolean;
  onSelect?: (id: string) => void;
  collapsed: boolean;
  onToggle: (id: string) => void;
  activeId?: string;
}) => {
  const theme = useTheme();
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 2;
  const prefix = hasChildren
    ? collapsed ? '\u25B6' : '\u25BC'
    : node.isCheckpoint ? '\u25C9' : '\u25CB';

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" paddingLeft={indent} gap={1}>
        {hasChildren ? (
          <Text color={theme.dim}>{prefix}</Text>
        ) : (
          <Text color={isActive ? theme.brand : theme.dim}>{prefix}</Text>
        )}
        <Text
          bold={isActive}
          color={isActive ? theme.brand : theme.text}
          wrap="truncate"
        >
          {truncate(node.label, 40)}
        </Text>
        <Text dimColor>{formatTime(node.createdAt)}</Text>
        {node.isCheckpoint && <Text color={theme.warning}>[checkpoint]</Text>}
        {isActive && <Text color={theme.success}>{'\u25C0'} active</Text>}
      </Box>
      {!collapsed && hasChildren && node.children!.map(child => (
        <Box key={child.id} flexDirection="column">
          <Box flexDirection="row" gap={1} paddingLeft={indent + 2}>
            <Text color={theme.dim}>{'\u2514'}</Text>
          </Box>
          <TreeNode
            node={child}
            depth={depth + 1}
            isActive={child.id === activeId}
            onSelect={onSelect}
            collapsed={false}
            onToggle={onToggle}
            activeId={activeId}
          />
        </Box>
      ))}
    </Box>
  );
});

export const SessionTree = memo(({ nodes, activeId, onSelect, maxHeight = 15 }: SessionTreeProps) => {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleNode = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
      <Box marginBottom={1}>
        <Text bold color={theme.text}>Session Tree</Text>
        <Text dimColor>  {nodes.length} branches</Text>
      </Box>
      {nodes.length === 0 ? (
        <Text dimColor>No branches yet</Text>
      ) : (
        <Box flexDirection="column" minHeight={Math.min(nodes.length, maxHeight)}>
          {nodes.slice(0, maxHeight).map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              isActive={node.id === activeId}
              onSelect={onSelect}
              collapsed={collapsed.has(node.id) && (node.children?.length ?? 0) > 0}
              onToggle={toggleNode}
              activeId={activeId}
            />
          ))}
          {nodes.length > maxHeight && (
            <Text dimColor>  ... {nodes.length - maxHeight} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
});
