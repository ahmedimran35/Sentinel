import { z } from 'zod';
import type { Tool } from '@sentinel/shared';

const ALLOWED_DOMAINS = [
  'github.com', 'raw.githubusercontent.com', 'npmjs.com',
  'docs.npmjs.com', 'nodejs.org', 'developer.mozilla.org',
  'stackoverflow.com', 'stackexchange.com', 'typescriptlang.org',
  'react.dev', 'vitest.dev', 'opencode.ai',
];

const WebFetchSchema = z.object({
  url: z.string().url(),
  format: z.enum(['markdown', 'text', 'html']).default('markdown'),
});

export const webFetchTool: Tool<typeof WebFetchSchema> = {
  name: 'web_fetch',
  description: 'Fetch a URL and return its content as text or markdown. Only allowed domains.',
  risk: 'network',
  inputSchema: WebFetchSchema,
  async *execute(input, ctx) {
    if (ctx.signal.aborted) return;

    try {
      const urlObj = new URL(input.url);

      if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: {
            callId: 'fetch',
            output: 'Only http and https protocols are allowed.',
            isError: true,
          },
        };
        return;
      }

      const rawDomain = urlObj.hostname;
      const domain = rawDomain.replace(/^www\./, '');

      const isAllowed = ALLOWED_DOMAINS.some((d) => {
        if (domain === d) return true;
        if (domain.endsWith('.' + d)) {
          const prefix = domain.slice(0, -('.' + d).length);
          return prefix.length > 0 && !prefix.includes('.');
        }
        return false;
      });

      if (!isAllowed) {
        yield {
          type: 'tool_result',
          turnId: ctx.sessionId,
          result: {
            callId: 'fetch',
            output: `Domain ${domain} is not in the allowlist. Allowed: ${ALLOWED_DOMAINS.join(', ')}`,
            isError: true,
          },
        };
        return;
      }

      const response = await fetch(input.url, { signal: ctx.signal });
      const text = await response.text();
      const maxLen = 50_000;
      const output = text.length > maxLen ? text.slice(0, maxLen) + `\n... (truncated at ${maxLen} chars)` : text;

      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: { callId: 'fetch', output, isError: false },
      };
    } catch (err) {
      yield {
        type: 'tool_result',
        turnId: ctx.sessionId,
        result: {
          callId: 'fetch',
          output: `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        },
      };
    }
  },
};
