import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { processAttachment, formatAsProviderMessage, hasVisionSupport, extractImageReferences, type ImageAttachment } from './image-attachment.js';

describe('processAttachment', () => {
  it('reads a file from disk by path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const filePath = join(dir, 'test.png');
    writeFileSync(filePath, Buffer.from('fake-png-data'));

    const result = await processAttachment(filePath);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('image');
    expect(result!.source).toEqual({
      type: 'base64',
      mediaType: 'image/png',
      data: Buffer.from('fake-png-data').toString('base64'),
    });

    rmSync(dir, { recursive: true });
  });

  it('returns null for unsupported format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const filePath = join(dir, 'test.bmp');
    writeFileSync(filePath, Buffer.from('fake-bmp-data'));

    const result = await processAttachment(filePath);
    expect(result).toBeNull();

    rmSync(dir, { recursive: true });
  });

  it('processes base64 input as-is', async () => {
    const data = Buffer.from('test-image').toString('base64');
    const result = await processAttachment({ base64: data, mediaType: 'image/jpeg' });
    expect(result).not.toBeNull();
    expect(result!.source).toEqual({ type: 'base64', mediaType: 'image/jpeg', data });
  });
});

describe('formatAsProviderMessage', () => {
  const base64Attachment: ImageAttachment = {
    type: 'image',
    source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
  };

  const urlAttachment: ImageAttachment = {
    type: 'image',
    source: { type: 'url', url: 'https://example.com/img.png' },
  };

  it('formats for Anthropic with base64 source', () => {
    const result = formatAsProviderMessage(base64Attachment, 'anthropic');
    expect(result).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
    });
  });

  it('formats for Anthropic with URL source', () => {
    const result = formatAsProviderMessage(urlAttachment, 'anthropic');
    expect(result).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://example.com/img.png' },
    });
  });

  it('formats for OpenAI with base64 source', () => {
    const result = formatAsProviderMessage(base64Attachment, 'openai');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc123' },
    });
  });

  it('formats for OpenAI with URL source', () => {
    const result = formatAsProviderMessage(urlAttachment, 'openai');
    expect(result).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/img.png' },
    });
  });
});

describe('hasVisionSupport', () => {
  it('returns true for vision-capable models', () => {
    expect(hasVisionSupport('claude-sonnet-4-20250514')).toBe(true);
    expect(hasVisionSupport('claude-opus-4-20250514')).toBe(true);
    expect(hasVisionSupport('gpt-4o-2024-08-06')).toBe(true);
    expect(hasVisionSupport('gemini-2.0-flash')).toBe(true);
    expect(hasVisionSupport('llava-1.6')).toBe(true);
    expect(hasVisionSupport('custom-vision-model')).toBe(true);
  });

  it('returns false for text-only models', () => {
    expect(hasVisionSupport('claude-3-haiku')).toBe(false);
    expect(hasVisionSupport('gpt-3.5-turbo')).toBe(false);
    expect(hasVisionSupport('llama-3-70b')).toBe(false);
    expect(hasVisionSupport('')).toBe(false);
  });
});

describe('extractImageReferences', () => {
  it('extracts full markdown image syntax', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const imgPath = join(dir, 'photo.png');
    writeFileSync(imgPath, Buffer.from('img-data'));

    const text = `Hello ![Photo](${imgPath}) world`;
    const result = await extractImageReferences(text, dir);

    expect(result.text).toBe('Hello [Image 1] world');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.source.type === 'base64' ? result.images[0]!.source.mediaType : '').toBe('image/png');

    rmSync(dir, { recursive: true });
  });

  it('extracts simple ![path] references', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sentinel-test-'));
    const imgPath = join(dir, 'icon.png');
    writeFileSync(imgPath, Buffer.from('icon-data'));

    const text = `Look at ![${imgPath}]`;
    const result = await extractImageReferences(text, dir);

    expect(result.text).toBe('Look at [Image 1]');
    expect(result.images).toHaveLength(1);

    rmSync(dir, { recursive: true });
  });

  it('returns text unchanged when no image references found', async () => {
    const result = await extractImageReferences('Hello world no images here', '/tmp');
    expect(result.text).toBe('Hello world no images here');
    expect(result.images).toHaveLength(0);
  });
});
