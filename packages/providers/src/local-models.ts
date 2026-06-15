import { request } from 'node:http';
import type { Provider } from './types.js';
import { createOllamaProvider } from './ollama.js';

export interface LocalModelInfo {
  name: string;
  size: number;
  modified: string;
  digest: string;
  running?: boolean;
}

export interface PullProgress {
  digest: string;
  total: number;
  completed: number;
  status: string;
}

const OLLAMA_DEFAULT = 'http://localhost:11434';

function ollamaFetch(path: string, baseUrl?: string): Promise<unknown> {
  const url = new URL(path, baseUrl ?? OLLAMA_DEFAULT);
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        } else {
          reject(new Error(`Ollama error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Ollama request timed out')); });
    req.end();
  });
}

export async function listLocalModels(baseUrl?: string): Promise<LocalModelInfo[]> {
  try {
    const result = await ollamaFetch('/api/tags', baseUrl) as { models?: LocalModelInfo[] };
    return result.models ?? [];
  } catch {
    return [];
  }
}

export async function isOllamaRunning(baseUrl?: string): Promise<boolean> {
  try {
    await ollamaFetch('/', baseUrl);
    return true;
  } catch {
    return false;
  }
}

export async function* pullModel(
  model: string,
  baseUrl?: string,
): AsyncIterable<PullProgress> {
  const url = new URL('/api/pull', baseUrl ?? OLLAMA_DEFAULT);
  const body = JSON.stringify({ name: model, stream: true });

  const res = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
    const req = request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 300_000,
    }, resolve);
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Pull request timed out')); });
    req.write(body);
    req.end();
  });

  let buffer = '';
  for await (const chunk of res) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line) as PullProgress;
        yield data;
      } catch { /* skip malformed */ }
    }
  }
}

export async function getLocalModelProvider(model: string, baseUrl?: string): Promise<Provider> {
  return createOllamaProvider({ model, baseUrl });
}

export function getRecommendedModels(): Array<{ name: string; size: string; ram: string; description: string }> {
  return [
    { name: 'llama3.2', size: '3B', ram: '4GB', description: 'Fast CPU-friendly general purpose' },
    { name: 'llama3.2', size: '1B', ram: '2GB', description: 'Lightweight, runs on anything' },
    { name: 'qwen2.5-coder', size: '7B', ram: '8GB', description: 'Best small coding model' },
    { name: 'qwen2.5-coder', size: '1.5B', ram: '4GB', description: 'Lightweight coder' },
    { name: 'mistral', size: '7B', ram: '8GB', description: 'Balanced general purpose' },
    { name: 'deepseek-coder-v2', size: '16B', ram: '16GB', description: 'Strong coding (Q4)' },
    { name: 'codellama', size: '7B', ram: '8GB', description: 'Meta code-specialized' },
    { name: 'phi3', size: '14B', ram: '8GB', description: 'Microsoft small but capable' },
    { name: 'llama3.1', size: '8B', ram: '8GB', description: 'Solid all-rounder' },
    { name: 'nemotron-mini', size: '4B', ram: '6GB', description: 'NVIDIA efficient' },
  ];
}
