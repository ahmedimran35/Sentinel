import { readFile } from 'node:fs/promises';
import { extname, resolve, isAbsolute } from 'node:path';
import { Buffer } from 'node:buffer';

const SUPPORTED_FORMATS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_SIZE = 20 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export interface ImageAttachment {
  type: 'image';
  source:
    | { type: 'base64'; mediaType: string; data: string }
    | { type: 'url'; url: string };
}

export async function processAttachment(
  input: string | { path?: string; url?: string; base64?: string; mediaType?: string },
): Promise<ImageAttachment | null> {
  if (typeof input === 'string') {
    return processAttachment({ path: input });
  }

  if (input.path) {
    const fullPath = isAbsolute(input.path) ? input.path : resolve(input.path);
    const ext = extname(fullPath).toLowerCase();
    const mediaType = EXT_TO_MIME[ext];
    if (!mediaType || !SUPPORTED_FORMATS.has(mediaType)) return null;

    const stat = await import('node:fs').then(f => f.promises.stat(fullPath)).catch(() => null);
    if (!stat || stat.size > MAX_SIZE) return null;

    const buffer = await readFile(fullPath);
    if (buffer.length > MAX_SIZE) return null;
    return { type: 'image', source: { type: 'base64', mediaType, data: buffer.toString('base64') } };
  }

  if (input.url) {
    const response = await fetch(input.url);
    if (!response.ok) return null;
    const mediaType = response.headers.get('content-type') || '';
    if (!SUPPORTED_FORMATS.has(mediaType)) return null;
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) return null;

    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_SIZE) return null;
    return { type: 'image', source: { type: 'base64', mediaType, data: Buffer.from(arrayBuf).toString('base64') } };
  }

  if (input.base64) {
    const mediaType = input.mediaType || 'image/png';
    if (!SUPPORTED_FORMATS.has(mediaType)) return null;
    if (input.base64.length > MAX_SIZE) return null;
    return { type: 'image', source: { type: 'base64', mediaType, data: input.base64 } };
  }

  return null;
}

export function formatAsProviderMessage(
  attachment: ImageAttachment,
  providerType: string,
): Record<string, unknown> {

  const provider = providerType.toLowerCase();

  if (provider === 'anthropic') {
    if (attachment.source.type === 'url') {
      return { type: 'image', source: { type: 'url', url: attachment.source.url } };
    }
    return {
      type: 'image',
      source: { type: 'base64', media_type: attachment.source.mediaType, data: attachment.source.data },
    };
  }

  if (provider === 'openai') {
    if (attachment.source.type === 'url') {
      return { type: 'image_url', image_url: { url: attachment.source.url } };
    }
    return {
      type: 'image_url',
      image_url: { url: `data:${attachment.source.mediaType};base64,${attachment.source.data}` },
    };
  }

  if (attachment.source.type === 'url') {
    return { type: 'image', data: { mediaType: 'image/png', base64: attachment.source.url } };
  }
  return { type: 'image', data: { mediaType: attachment.source.mediaType, base64: attachment.source.data } };
}

export function hasVisionSupport(model: string): boolean {
  const lower = model.toLowerCase();
  const keywords = ['sonnet', 'opus', 'gpt-4', 'gemini', 'vision', 'llava'];
  return keywords.some(kw => lower.includes(kw));
}

export async function extractImageReferences(
  text: string,
  projectRoot: string,
): Promise<{ text: string; images: ImageAttachment[] }> {
  const images: ImageAttachment[] = [];
  let result = text;

  type ReplaceOp = { start: number; end: number; marker: string };

  const fullOps: ReplaceOp[] = [];
  const fullRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = fullRe.exec(result)) !== null) {
    const path = m[2]!;
    const absPath = isAbsolute(path) ? path : resolve(projectRoot, path);
    const attachment = await processAttachment({ path: absPath }).catch(() => null);
    if (attachment) {
      images.push(attachment);
      fullOps.push({ start: m.index, end: m.index + m[0].length, marker: `[Image ${images.length}]` });
    }
  }

  fullOps.sort((a, b) => b.start - a.start);
  for (const op of fullOps) {
    result = result.slice(0, op.start) + op.marker + result.slice(op.end);
  }

  const simpleOps: ReplaceOp[] = [];
  const simpleRe = /!\[([^\]]+)\]/g;

  while ((m = simpleRe.exec(result)) !== null) {
    const path = m[1]!;
    const absPath = isAbsolute(path) ? path : resolve(projectRoot, path);
    const attachment = await processAttachment({ path: absPath }).catch(() => null);
    if (attachment) {
      images.push(attachment);
      simpleOps.push({ start: m.index, end: m.index + m[0].length, marker: `[Image ${images.length}]` });
    }
  }

  simpleOps.sort((a, b) => b.start - a.start);
  for (const op of simpleOps) {
    result = result.slice(0, op.start) + op.marker + result.slice(op.end);
  }

  return { text: result, images };
}
