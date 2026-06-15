import { Box, Text, useInput } from 'ink';
import { useState, useCallback, type FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';

export interface WorkflowStep {
  id: string;
  label: string;
  type: 'agent' | 'tool' | 'gate' | 'parallel' | 'loop';
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  children?: WorkflowStep[];
  config?: Record<string, unknown>;
}

interface WorkflowComposerProps {
  steps: WorkflowStep[];
  onStepClick?: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
  onAddStep?: (afterId?: string) => void;
  onRemoveStep?: (id: string) => void;
  onToggleCollapse?: (id: string) => void;
  readOnly?: boolean;
  maxDepth?: number;
}

const STEP_ICONS: Record<WorkflowStep['type'], string> = {
  agent: '\u2699',
  tool: '\u2692',
  gate: '\u25C9',
  parallel: '\u2261',
  loop: '\u21BB',
};

const STATUS_ICONS: Record<WorkflowStep['status'], string> = {
  pending: '\u25CB',
  running: '\u25D4',
  done: '\u2713',
  error: '\u2717',
  skipped: '\u2014',
};

const STATUS_COLORS: Record<WorkflowStep['status'], string> = {
  pending: 'dim',
  running: 'info',
  done: 'success',
  error: 'error',
  skipped: 'dim',
};

const StepNode: FunctionComponent<{
  step: WorkflowStep;
  depth: number;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  maxDepth: number;
}> = ({ step, depth, index, selected, onSelect, collapsed, onToggle, maxDepth }) => {
  const theme = useTheme();
  const hasChildren = step.children && step.children.length > 0;
  const isCollapsed = collapsed.has(step.id);
  const statusColorKey = STATUS_COLORS[step.status] as keyof typeof theme;
  const sc = (theme as unknown as Record<string, string>)[statusColorKey] ?? theme.text;
  const indent = depth * 2;

  if (depth > maxDepth && !isCollapsed) {
    return null;
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="row"
        paddingLeft={indent}
        gap={1}
        backgroundColor={selected ? theme.brand + '30' : undefined}
      >
        <Text color={theme.dim}>{hasChildren ? (isCollapsed ? '\u25B6' : '\u25BC') : ' '}</Text>
        <Text color={theme.dim}>{String(index + 1).padStart(2, ' ')}.</Text>
        <Text color={theme.dim}>{STEP_ICONS[step.type]}</Text>
        <Text color={sc}>{STATUS_ICONS[step.status]}</Text>
        <Text bold color={selected ? theme.brand : theme.text}>{step.label}</Text>
        {step.detail && <Text dimColor wrap="truncate">— {step.detail}</Text>}
        <Text color={theme.dim}>({step.type})</Text>
      </Box>
      {!isCollapsed && hasChildren && (
        <Box flexDirection="column" width="100%">
          <Box paddingLeft={indent + 1}>
            <Text dimColor>{'\u2502'}</Text>
          </Box>
          {step.children!.map((child, i) => (
            <StepNode
              key={child.id}
              step={child}
              depth={depth + 1}
              index={i}
              selected={false}
              onSelect={onSelect}
              collapsed={collapsed}
              onToggle={onToggle}
              maxDepth={maxDepth}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export const WorkflowComposer: FunctionComponent<WorkflowComposerProps> = ({
  steps,
  onStepClick,
  readOnly = false,
  maxDepth = 4,
}) => {
  const theme = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cursorIdx, setCursorIdx] = useState(0);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSteps = useCallback((nodes: WorkflowStep[]): WorkflowStep[] => {
    const result: WorkflowStep[] = [];
    for (const n of nodes) {
      result.push(n);
      if (n.children) result.push(...allSteps(n.children));
    }
    return result;
  }, []);

  const flatSteps = allSteps(steps);

  useInput((_input, key) => {
    if (readOnly) return;
    if (key.downArrow) {
      setCursorIdx(prev => Math.min(flatSteps.length - 1, prev + 1));
      return;
    }
    if (key.upArrow) {
      setCursorIdx(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.return && flatSteps[cursorIdx]) {
      setSelectedId(flatSteps[cursorIdx]!.id);
      onStepClick?.(flatSteps[cursorIdx]!.id);
      return;
    }
    if (_input === ' ' && flatSteps[cursorIdx]) {
      toggleCollapse(flatSteps[cursorIdx]!.id);
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
      <Box marginBottom={1} gap={1}>
        <Text bold color={theme.text}>Workflow</Text>
        <Text dimColor>{steps.length} top-level steps</Text>
        <Text dimColor>{'\u2191\u2193'} navigate</Text>
        <Text dimColor>{'\u2423'} collapse</Text>
      </Box>
      {steps.length === 0 ? (
        <Box justifyContent="center" paddingY={1}>
          <Text dimColor>No workflow steps defined</Text>
        </Box>
      ) : (
        <Box flexDirection="column" width="100%">
          {steps.map((step, i) => (
            <StepNode
              key={step.id}
              step={step}
              depth={0}
              index={i}
              selected={step.id === selectedId}
              onSelect={(id) => { setSelectedId(id); onStepClick?.(id); }}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              maxDepth={maxDepth}
            />
          ))}
        </Box>
      )}
      {!readOnly && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>{'\u23CE'} select</Text>
          <Text dimColor>{'\u2191\u2193'} navigate</Text>
          <Text dimColor>{'\u2423'} expand/collapse</Text>
        </Box>
      )}
    </Box>
  );
};
