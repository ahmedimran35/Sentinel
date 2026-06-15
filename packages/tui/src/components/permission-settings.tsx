import { useState, type FunctionComponent } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';
import type { Theme } from '../theme.js';
import type { ToolPermissionLevel } from '@sentinel/core';

export interface PerToolPermission {
  tool: string;
  permission: ToolPermissionLevel;
}

const TOOL_LIST = [
  'bash', 'read', 'edit', 'glob', 'grep', 'write',
  'task', 'skill', 'lsp', 'question', 'webfetch',
  'websearch', 'external_directory', 'doom_loop', 'todowrite',
];

const LEVEL_ORDER: ToolPermissionLevel[] = ['allow', 'ask', 'deny'];

function cycleLevel(current: ToolPermissionLevel): ToolPermissionLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  return LEVEL_ORDER[(idx + 1) % LEVEL_ORDER.length]!;
}

function levelColor(level: ToolPermissionLevel, theme: Theme): string {
  if (level === 'allow') return theme.success;
  if (level === 'deny') return theme.error;
  return theme.warning;
}

interface PermissionSettingsProps {
  permissions: PerToolPermission[];
  defaultLevel: ToolPermissionLevel;
  onChange: (permissions: PerToolPermission[], defaultLevel: ToolPermissionLevel) => void;
  onClose: () => void;
}

export const PermissionSettings: FunctionComponent<PermissionSettingsProps> = ({
  permissions: initialPermissions,
  defaultLevel: initialDefault,
  onChange,
  onClose,
}) => {
  const theme = useTheme();
  const [permissions, setPermissions] = useState<PerToolPermission[]>(initialPermissions);
  const [defaultLevel, setDefaultLevel] = useState<ToolPermissionLevel>(initialDefault);
  const lines = [
    { type: 'default' as const, tool: '(default)', permission: defaultLevel },
    ...TOOL_LIST.map(tool => {
      const existing = permissions.find(p => p.tool === tool);
      return { type: 'tool' as const, tool, permission: existing?.permission ?? defaultLevel };
    }),
  ];
  const [selIdx, setSelIdx] = useState(0);
  const [scrollOff, setScrollOff] = useState(0);
  const maxVisible = 15;

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelIdx(p => {
        const n = Math.max(p - 1, 0);
        if (n < scrollOff) setScrollOff(n);
        return n;
      });
      return;
    }
    if (key.downArrow) {
      setSelIdx(p => {
        const n = Math.min(p + 1, lines.length - 1);
        if (n >= scrollOff + maxVisible) setScrollOff(n - maxVisible + 1);
        return n;
      });
      return;
    }
    if (key.return) {
      const selected = lines[selIdx];
      if (!selected) return;
      if (selected.type === 'default') {
        const next = cycleLevel(defaultLevel);
        setDefaultLevel(next);
      } else {
        setPermissions(prev => {
          const existing = prev.findIndex(p => p.tool === selected.tool);
          const current = existing >= 0 ? prev[existing]!.permission : defaultLevel;
          const next = cycleLevel(current);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing]!, permission: next };
            return updated;
          }
          return [...prev, { tool: selected.tool, permission: next }];
        });
      }
      return;
    }
    if (key.escape) {
      onChange(permissions, defaultLevel);
      onClose();
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
      <Box>
        <Text bold color={theme.info}> Per-Tool Permission Settings</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {lines.slice(scrollOff, scrollOff + maxVisible).map((line, i) => {
          const idx = i + scrollOff;
          const isDefault = line.type === 'default';
          const color = isDefault ? theme.dim : theme.text;
          const badgeColor = levelColor(line.permission, theme);
          return (
            <Box key={line.tool}>
              <Text>{idx === selIdx ? <Text color={theme.info}>▸ </Text> : <Text>  </Text>}</Text>
              <Text bold={!isDefault} dimColor={isDefault} color={idx === selIdx ? theme.info : color}>
                {line.tool.padEnd(20)}
              </Text>
              <Text color={badgeColor}>
                [{line.permission.toUpperCase()}]
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter cycle level · Esc save & close</Text>
      </Box>
    </Box>
  );
};
