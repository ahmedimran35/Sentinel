import { describe, it, expect } from 'vitest';
import { parseSSE } from './sse-parser.js';

describe('parseSSE', () => {
  it('parses basic SSE messages', async () => {
    const data = new TextEncoder().encode('data: hello\n\ndata: world\n\n');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const messages: Array<{ data: string }> = [];
    for await (const msg of parseSSE(stream, new AbortController().signal)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]?.data).toBe('hello');
    expect(messages[1]?.data).toBe('world');
  });

  it('parses event type and id', async () => {
    const data = new TextEncoder().encode('event: test\ndata: {"key":"value"}\nid: 42\n\n');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const messages: Array<{ event?: string; data: string; id?: string }> = [];
    for await (const msg of parseSSE(stream, new AbortController().signal)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]?.event).toBe('test');
    expect(messages[0]?.data).toBe('{"key":"value"}');
    expect(messages[0]?.id).toBe('42');
  });

  it('handles chunked data', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hel'));
        controller.enqueue(new TextEncoder().encode('lo\n\n'));
        controller.close();
      },
    });

    const messages: Array<{ data: string }> = [];
    for await (const msg of parseSSE(stream, new AbortController().signal)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe('hello');
  });

  it('handles SSE with "data: [DONE]"', async () => {
    const data = new TextEncoder().encode('data: [DONE]\n\n');
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const messages: Array<{ data: string }> = [];
    for await (const msg of parseSSE(stream, new AbortController().signal)) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toBe('[DONE]');
  });
});
