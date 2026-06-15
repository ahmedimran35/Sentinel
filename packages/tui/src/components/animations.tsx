import { Box, Text } from 'ink';
import type { FunctionComponent } from 'react';
import { useTheme } from '../theme-context.js';
import { useAnimation, useSpinner } from '../hooks/use-animation.js';

// ── Spinner sets ──
const SPINNER_BRAILLE = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
const SPINNER_ORBIT = ['◐', '◓', '◑', '◒'];
const SPINNER_STARS = ['✧', '★', '✦', '★'];

// ── Progress bar frames ──
const PROGRESS_FRAMES = [
  '░░░░░░░░░░',
  '▓░░░░░░░░░',
  '▓▓░░░░░░░░',
  '▓▓▓░░░░░░░',
  '▓▓▓▓░░░░░░',
  '▓▓▓▓▓░░░░░',
  '▓▓▓▓▓▓░░░░',
  '▓▓▓▓▓▓▓░░░',
  '▓▓▓▓▓▓▓▓░░',
  '▓▓▓▓▓▓▓▓▓░',
  '▓▓▓▓▓▓▓▓▓▓',
];

// ── Animated spinner wrapper ──
export const AnimatedSpinner: FunctionComponent<{ label?: string; color?: string; isActive?: boolean }> = ({
  label,
  color,
  isActive = true,
}) => {
  const theme = useTheme();
  const c = color ?? theme.brand;
  const spinner = useSpinner(SPINNER_BRAILLE, 100, isActive);
  const { frame } = useAnimation({ interval: 400, isActive });
  const words = ['processing', 'thinking', 'computing', 'analyzing'];
  const word = words[frame % words.length];

  return (
    <Box>
      <Text color={c}>{spinner}</Text>
      {label && <Text color={c}> {label}</Text>}
      {!label && <Text dimColor> {word}</Text>}
    </Box>
  );
};

// ── Tool Pulse — animated border glow for active tool calls ──
export const ToolPulse: FunctionComponent<{
  children: React.ReactNode;
  isActive: boolean;
  toolName: string;
  accentColor?: string;
}> = ({ children, isActive, toolName, accentColor }) => {
  const theme = useTheme();
  const color = accentColor ?? theme.warning;

  if (!isActive) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.borderSubtle} paddingX={1}>
        <Box>
          <Text dimColor>{'\u25B8'}</Text>
          <Text color={theme.dim}> {toolName}</Text>
        </Box>
        {children}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Box>
        <Text color={color}>{'\u25C9'}</Text>
        <Text color={color}> {toolName}</Text>
        <AnimatedSpinner isActive />
      </Box>
      {children}
    </Box>
  );
};

// ── Animated progress bar ──
export const AnimatedProgress: FunctionComponent<{
  value: number;
  max: number;
  width?: number;
  color?: string;
}> = ({ value, max, width = 20, color }) => {
  const theme = useTheme();
  const c = color ?? theme.info;
  const ratio = max > 0 ? value / max : 0;
  const barIndex = Math.min(Math.round(ratio * (PROGRESS_FRAMES.length - 1)), PROGRESS_FRAMES.length - 1);
  const bar = PROGRESS_FRAMES[barIndex] ?? PROGRESS_FRAMES[0]!;

  return (
    <Box>
      <Text color={c}>{bar.slice(0, width)}</Text>
    </Box>
  );
};

// ── Animated web fetch indicator ──
export const WebFetchAnimation: FunctionComponent<{ url: string; isActive?: boolean }> = ({ url, isActive = true }) => {
  const theme = useTheme();
  const spinner = useSpinner(SPINNER_ORBIT, 200, isActive);

  if (!isActive) {
    return (
      <Box>
        <Text color={theme.success}>{'\u2713'}</Text>
        <Text dimColor> {url}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={theme.info}>{spinner}</Text>
      <Text dimColor> {url}</Text>
    </Box>
  );
};

// ── Animated file operation ──
export const FileOpAnimation: FunctionComponent<{
  operation: 'read' | 'write' | 'edit' | 'delete';
  path: string;
  isActive?: boolean;
}> = ({ operation, path, isActive = true }) => {
  const theme = useTheme();
  const spinner = useSpinner(SPINNER_STARS, 300, isActive);
  const opColor = operation === 'delete' ? theme.error : theme.info;

  if (!isActive) {
    return (
      <Box>
        <Text color={theme.success}>{'\u2713'}</Text>
        <Text dimColor> {path}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={opColor}>{spinner}</Text>
      <Text color={theme.dim}> </Text>
      <Text dimColor>{path}</Text>
    </Box>
  );
};

// ── Animated search/grep line scanner ──
export const SearchAnimation: FunctionComponent<{ pattern: string; isActive?: boolean }> = ({ pattern, isActive = true }) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 80, isActive });
  const scanLine = '─'.repeat(Math.min(pattern.length + 4, 40));
  const offset = frame % scanLine.length;
  const animated = scanLine.slice(0, offset) + '●' + scanLine.slice(offset + 1);

  if (!isActive) {
    return (
      <Box>
        <Text color={theme.success}>{'\u2713'}</Text>
        <Text dimColor> {pattern}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={theme.warning}>🔍 </Text>
      <Text dimColor>{animated}</Text>
      <Text color={theme.warning}> /{pattern}/</Text>
    </Box>
  );
};

// ── Phase indicator (for multi-step operations) ──
export interface Phase {
  label: string;
  icon: string;
  color: string;
}

export const PhaseIndicator: FunctionComponent<{
  phases: Phase[];
  currentPhase: number;
}> = ({ phases, currentPhase }) => {
  return (
    <Box gap={1}>
      {phases.map((phase, i) => {
        const done = i < currentPhase;
        const active = i === currentPhase;
        const color = done ? '#34d399' : active ? phase.color : '#4b5563';
        const icon = done ? '\u2713' : active ? phase.icon : '\u25CB';
        return (
          <Box key={i}>
            <Text color={color}>{icon}</Text>
            <Text color={color}> {phase.label}</Text>
            {i < phases.length - 1 && <Text dimColor> →</Text>}
          </Box>
        );
      })}
    </Box>
  );
};

// ── Animated typewriter text ──
export const TypewriterText: FunctionComponent<{
  text: string;
  speed?: number;
  isActive?: boolean;
  color?: string;
}> = ({ text, speed = 30, isActive = true, color }) => {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: speed, isActive });
  const chars = Math.min(frame, text.length);
  const visible = text.slice(0, chars);
  const cursor = isActive && chars < text.length ? '\u258C' : '';

  return (
    <Text color={color ?? theme.text}>
      {visible}
      <Text color={theme.brand}>{cursor}</Text>
    </Text>
  );
};

// ── Animated header logo with shimmer ──
export const AnimatedLogo: FunctionComponent<{ isActive?: boolean }> = ({ isActive = true }) => {
  const theme = useTheme();
  const { time } = useAnimation({ interval: 50, isActive });
  const chars = '\u25C6\u25C8\u25CB\u25A3';
  const char = chars[Math.floor(time / 400) % chars.length];

  return (
    <Box>
      <Text color={theme.brand}>{char}</Text>
      <Text color={theme.brand}> Sentinel</Text>
    </Box>
  );
};
