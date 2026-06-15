import { Box, Text, useStdout } from 'ink';
import { memo, useMemo } from 'react';
import { useTheme } from '../theme-context.js';

function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '$1')
    .replace(/^## (.+)$/gm, '$1')
    .replace(/^# (.+)$/gm, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\* (.+)/g, '- $1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/> /gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface WebPreviewProps {
  html?: string;
  markdown?: string;
  url?: string;
  maxHeight?: number;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, 'blocked:');
}

function stripHtml(html: string): string {
  return html
    .replace(/<head>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}

export const WebPreview = memo(({ html, markdown, url, maxHeight = 20 }: WebPreviewProps) => {
  const theme = useTheme();
  const { stdout } = useStdout();
  const termWidth = stdout.columns ?? 80;
  const previewWidth = Math.min(termWidth - 4, 80);

  const renderedContent = useMemo(() => {
    if (markdown) {
      return stripHtml(simpleMarkdown(markdown));
    }
    if (html) {
      return stripHtml(sanitizeHtml(html));
    }
    return '';
  }, [html, markdown]);

  const displayContent = useMemo(
    () => truncateLines(renderedContent, maxHeight),
    [renderedContent, maxHeight],
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1} width="100%">
      <Box marginBottom={1} gap={1}>
        <Text bold color={theme.info}>{'\u25C8'} Preview</Text>
        {url && <Text dimColor wrap="truncate">{url}</Text>}
        {!renderedContent && <Text dimColor>empty</Text>}
      </Box>
      {displayContent ? (
        <Box flexDirection="column" width={previewWidth}>
          {displayContent.split('\n').map((line, i) => {
            if (line.startsWith('# ')) return <Text key={i} bold color={theme.brand}>{line.replace(/^# /, '')}</Text>;
            if (line.startsWith('## ')) return <Text key={i} bold color={theme.text}>{line.replace(/^## /, '')}</Text>;
            if (line.startsWith('### ')) return <Text key={i} bold color={theme.text}>{line.replace(/^### /, '')}</Text>;
            if (line.startsWith('- ') || line.startsWith('* ')) return (
              <Box key={i} paddingLeft={2}>
                <Text color={theme.dim}>{'\u2022'} </Text>
                <Text color={theme.text}>{line.replace(/^[-*] /, '')}</Text>
              </Box>
            );
            if (/^\d+\. /.test(line)) return (
              <Box key={i} paddingLeft={2}>
                <Text color={theme.dim}>{line.match(/^\d+\./)?.[0]} </Text>
                <Text color={theme.text}>{line.replace(/^\d+\. /, '')}</Text>
              </Box>
            );
            if (line.startsWith('```') || line.startsWith('~~~')) return null;
            if (line.startsWith('|')) return <Text key={i} dimColor>{line}</Text>;
            if (line.trim() === '') return <Box key={i} height={1} />;
            if (line.startsWith('> ')) return <Text key={i} color={theme.info} dimColor>{line}</Text>;
            if (line.startsWith('---') || line.startsWith('***')) return (
              <Box key={i} width="100%">
                <Text dimColor>{'\u2500'.repeat(previewWidth)}</Text>
              </Box>
            );
            return (
              <Text key={i} color={theme.text} wrap="wrap">
                {line}
              </Text>
            );
          })}
        </Box>
      ) : (
        <Box justifyContent="center" paddingY={1}>
          <Text dimColor>No content to preview</Text>
        </Box>
      )}
      {url && (
        <Box marginTop={1}>
          <Text dimColor>{'\u2197'} </Text>
          <Text color={theme.info} wrap="truncate">{url}</Text>
        </Box>
      )}
    </Box>
  );
});
