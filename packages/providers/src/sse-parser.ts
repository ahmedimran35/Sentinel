export interface SSEMessage {
  event?: string;
  data: string;
  id?: string;
}

export async function* parseSSE(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SSEMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;
  let currentData = '';
  let currentId: string | undefined;

  try {
    while (true) {
      if (signal.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).replace(/^ /, '');
        } else if (line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, '');
          currentData += (currentData ? '\n' : '') + value;
        } else if (line.startsWith('id:')) {
          currentId = line.slice(3).trim();
        } else if (line === '') {
          if (currentData) {
            yield { event: currentEvent, data: currentData, id: currentId };
          }
          currentEvent = undefined;
          currentData = '';
          currentId = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (currentData) {
    yield { event: currentEvent, data: currentData, id: currentId };
  }
}

export function parseJSONData<T>(msg: SSEMessage): T {
  return JSON.parse(msg.data) as T;
}
