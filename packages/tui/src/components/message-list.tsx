import { type FunctionComponent } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme-context.js';
import type { ConversationEntry } from '../app.js';
import { parseMarkdown } from '../markdown.js';
import { DiffView } from './diff-view.js';
import { ToolPulse, WebFetchAnimation, FileOpAnimation, SearchAnimation, TypewriterText } from './animations.js';
import { LiveTokenCounter } from './live-token-counter.js';
import { BashFlame } from './bash-flame.js';

interface MessageListProps {
  conversation: ConversationEntry[];
  showToolOutput?: boolean;
  showThinking?: boolean;
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  if (name === 'write_file' || name === 'edit_file') {
    const filePath = String(args.path ?? '');
    const content = String(args.content ?? '');
    const size = content.length;
    const preview = content.slice(0, 80).replace(/\n/g, '\\n');
    return `${filePath}  (${size} chars)\n  ${preview}${size > 80 ? '\u2026' : ''}`;
  }
  if (name === 'bash') {
    const cmd = String(args.command ?? '');
    return cmd.length > 120 ? cmd.slice(0, 120) + '\u2026' : cmd;
  }
  if (name === 'glob' || name === 'grep') {
    return String(args.pattern ?? args.path ?? '');
  }
  const lines = JSON.stringify(args, null, 2);
  return lines.length > 300 ? lines.slice(0, 300) + '\u2026' : lines;
}

const WEB_TOOLS = new Set(['web_fetch', 'webFetch', 'web_search', 'webSearch', 'fetch']);
const FILE_WRITE_TOOLS = new Set(['write_file', 'writeFile', 'edit_file', 'editFile']);
const FILE_READ_TOOLS = new Set(['read_file', 'readFile', 'read']);
const SEARCH_TOOLS = new Set(['grep', 'glob', 'search', 'find']);
const BASH_TOOLS = new Set(['bash', 'execute_command', 'run']);

function renderToolAnimation(name: string, args: Record<string, unknown>, hasResult: boolean, theme: any, isLatest: boolean) {
  if (WEB_TOOLS.has(name)) {
    const url = String(args.url ?? args.query ?? '');
    return <WebFetchAnimation url={url} isActive={isLatest && !hasResult} />;
  }
  if (FILE_WRITE_TOOLS.has(name)) {
    const filePath = String(args.path ?? '');
    return <FileOpAnimation operation="write" path={filePath} isActive={isLatest && !hasResult} />;
  }
  if (FILE_READ_TOOLS.has(name)) {
    const filePath = String(args.path ?? '');
    return <FileOpAnimation operation="read" path={filePath} isActive={isLatest && !hasResult} />;
  }
  if (SEARCH_TOOLS.has(name)) {
    const pattern = String(args.pattern ?? args.path ?? '');
    return <SearchAnimation pattern={pattern} isActive={isLatest && !hasResult} />;
  }
  if (BASH_TOOLS.has(name)) {
    const cmd = String(args.command ?? '');
    if (!hasResult && isLatest) {
      return <BashFlame isActive />;
    }
    return <Text color={isLatest && !hasResult ? theme.warning : theme.dim}>$ {cmd}</Text>;
  }
  return null;
}

function RichText({ content }: { content: string }) {
  const segments = parseMarkdown(content);
  const theme = useTheme();
  return (
    <Text>
      {segments.map((seg, i) => {
        if (seg.style === 'bold') return <Text key={i} bold color={theme.text}>{seg.text}</Text>;
        if (seg.style === 'italic') return <Text key={i} italic color={theme.text}>{seg.text}</Text>;
        if (seg.style === 'code') return <Text key={i} color={theme.warning}>{seg.text}</Text>;
        if (seg.style === 'heading') return <Text key={i} bold color={theme.info}>{seg.text}</Text>;
        if (seg.style === 'link') return <Text key={i} color={theme.info} underline>{seg.text}</Text>;
        if (seg.style === 'linkText') return <Text key={i} bold color={theme.brand}>{seg.text}</Text>;
        if (seg.style === 'strikethrough') return <Text key={i} dimColor>{seg.text}</Text>;
        if (seg.style === 'blockquote') return <Text key={i} color={theme.dim} italic>{'\u2503 '}{seg.text}</Text>;
        if (seg.style === 'list') return <Text key={i} color={theme.text}>{seg.text}</Text>;
        return <Text key={i} color={theme.text}>{seg.text}</Text>;
      })}
    </Text>
  );
}

export const MessageList: FunctionComponent<MessageListProps> = ({ conversation, showToolOutput = true }) => {
  const theme = useTheme();

  return (
    <Box flexDirection="column" flexGrow={1}>
      {conversation.map((block, i) => {
        const isLatest = i === conversation.length - 1;
        const isStreaming = isLatest && block.role === 'assistant' && block.content.length > 0;

        if (block.role === 'user') {
          return (
            <Box key={`u${i}`} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color={theme.user}>
                  {'\u25B6'} You
                </Text>
                {block.tokens !== undefined && (
                  <Text dimColor>  {block.tokens} tok</Text>
                )}
              </Box>
              <Box marginLeft={2} borderStyle="single" borderColor={theme.borderSubtle} paddingX={1}>
                <RichText content={block.content} />
              </Box>
            </Box>
          );
        }

        if (block.role === 'assistant') {
          return (
            <Box key={`a${i}`} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold color={theme.brand}>
                  {'\u25C9'} Sentinel
                </Text>
                {block.tokens !== undefined && (
                  <Box>
                    <Text dimColor>  </Text>
                    <LiveTokenCounter target={block.tokens} isActive={isStreaming} label="tok" />
                  </Box>
                )}
              </Box>
              <Box marginLeft={2}>
                {isStreaming && block.content.length > 50 ? (
                  <TypewriterText text={block.content} isActive />
                ) : (
                  <RichText content={block.content} />
                )}
              </Box>
              {showToolOutput && block.tools && block.tools.length > 0 && (
                <Box marginLeft={2} marginTop={1} flexDirection="column" gap={1}>
                  {block.tools.map((tool, ti) => {
                    const isToolLatest = ti === block.tools!.length - 1;
                    const hasResult = !!tool.result;
                    const anim = renderToolAnimation(tool.name, tool.args, hasResult, theme, isToolLatest && isLatest);
                    return (
                      <ToolPulse
                        key={`t${i}_${ti}`}
                        toolName={tool.name}
                        isActive={isToolLatest && isLatest && !hasResult}
                      >
                        <Box marginLeft={2} flexDirection="column">
                          {anim ? (
                            <Box marginBottom={hasResult ? 0 : 0}>
                              {anim}
                            </Box>
                          ) : (
                            <Text dimColor>{'$ '}{formatToolArgs(tool.name, tool.args)}</Text>
                          )}
                          {tool.result && (
                            <Box marginTop={1}>
                              <Text color={tool.result.startsWith('Error') ? theme.error : theme.success} dimColor>
                                {tool.result.length > 200 ? tool.result.slice(0, 200) + '\u2026' : tool.result}
                              </Text>
                            </Box>
                          )}
                        </Box>
                      </ToolPulse>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        }

        if (block.role === 'diff') {
          return (
            <Box key={`d${i}`} marginBottom={1}>
              <DiffView diff={block.content} />
            </Box>
          );
        }

        if (block.role === 'error') {
          return (
            <Box key={`e${i}`} marginBottom={1} paddingX={1} paddingY={1} borderStyle="round" borderColor={theme.error}>
              <Text color={theme.error}>{'\u2717'} Error: {block.message}</Text>
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
};
