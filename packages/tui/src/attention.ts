import { sendNotification } from '@sentinel/core';
import type { AttentionConfig } from './tui-config.js';

const SOUND_THROTTLE_MS = 2_000;
let lastSoundAt = 0;

function playBell(volume: number): void {
  const now = Date.now();
  if (now - lastSoundAt < SOUND_THROTTLE_MS) return;
  lastSoundAt = now;
  if (volume > 0) {
    process.stdout.write('\x07');
  }
}

export function fireAttention(
  config: AttentionConfig,
  title: string,
  body: string,
): void {

  if (!config.enabled) return;

  if (config.notifications) {
    sendNotification(title, body).catch(() => {});
  }

  if (config.sound) {
    playBell(config.volume);
  }
}

export function getAttentionTitle(kind: 'question' | 'permission' | 'error' | 'done'): string {

  switch (kind) {
    case 'question': return 'Question';
    case 'permission': return 'Permission Required';
    case 'error': return 'Session Error';
    case 'done': return 'Session Complete';
  }
}
