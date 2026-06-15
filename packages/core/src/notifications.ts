import { spawnSync } from 'node:child_process';

const THROTTLE_MS = 5_000;
const DEDUP_MS = 30_000;

let lastSentAt = 0;
const dedupCache = new Map<string, number>();

function isThrottled(): boolean {
  return Date.now() - lastSentAt < THROTTLE_MS;
}

function isDuplicate(title: string, body: string): boolean {
  const key = `${title}|${body}`;
  const last = dedupCache.get(key);
  if (last && Date.now() - last < DEDUP_MS) return true;
  dedupCache.set(key, Date.now());
  return false;
}

function platformSend(title: string, body: string): boolean {
  try {
    if (process.platform === 'darwin') {
      const result = spawnSync('osascript', ['-e',
        `display notification (system attribute "NOTIFY_BODY") with title (system attribute "NOTIFY_TITLE")`,
      ], {
        timeout: 5_000,
        stdio: 'ignore',
        env: { ...process.env, NOTIFY_TITLE: title, NOTIFY_BODY: body },
      });
      return result.status === 0;
    }
    if (process.platform === 'linux') {
      const which = spawnSync('which', ['notify-send'], { timeout: 2_000, stdio: 'ignore' });
      if (which.status !== 0) return false;
      const result = spawnSync('notify-send', [title, body], {
        timeout: 5_000,
        stdio: 'ignore',
      });
      return result.status === 0;
    }
    if (process.platform === 'win32') {
      try {
        const result = spawnSync('powershell', [
          '-command',
          `[System.Windows.Forms.MessageBox]::Show('${body.replace(/'/g, "''")}','${title.replace(/'/g, "''")}')`,
        ], { timeout: 5_000, stdio: 'ignore' });
        return result.status === 0;
      } catch {
        const result = spawnSync('msg', ['*', `${title}: ${body}`], {
          timeout: 5_000,
          stdio: 'ignore',
        });
        return result.status === 0;
      }
    }
  } catch {
    // fall through
  }
  return false;
}

export async function sendNotification(
  title: string,
  body: string,
  options?: { silent?: boolean; action?: string },
): Promise<void> {
  const enabled =
    process.env.SENTINEL_NOTIFICATIONS_ENABLED !== 'false';
  if (!enabled) return;

  if (isThrottled()) return;
  if (isDuplicate(title, body)) return;

  lastSentAt = Date.now();

  const sent = platformSend(title, body);
  if (!sent) {
    process.stderr.write(`[NOTIFICATION] ${title}: ${body}\n`);
    if (options?.action) {
      process.stderr.write(`[NOTIFICATION ACTION] ${options.action}\n`);
    }
  }
}

export class NotificationManager {
  private enabled = true;
  private onTurnEndEnabled = true;
  private onPermissionRequestEnabled = true;
  private onErrorEnabled = true;
  private silent = false;

  constructor() {
    if (process.env.SENTINEL_NOTIFICATIONS_ENABLED === 'false') {
      this.enabled = false;
    }
    if (process.env.SENTINEL_NOTIFICATIONS_SILENT === 'true') {
      this.silent = true;
    }
  }

  async send(
    title: string,
    body: string,
    options?: { silent?: boolean; action?: string },
  ): Promise<void> {
    if (!this.enabled) return;
    await sendNotification(title, body, {
      silent: options?.silent ?? this.silent,
      action: options?.action,
    });
  }

  async onTurnStart(_turnId: string): Promise<void> {
    // no notification on turn start
  }

  async onTurnEnd(turnId: string, status: string): Promise<void> {
    if (!this.enabled || !this.onTurnEndEnabled) return;
    await this.send(
      'Turn Complete',
      `Turn ${turnId} finished with status: ${status}`,
    );
  }

  async onPermissionRequest(action: string): Promise<void> {
    if (!this.enabled || !this.onPermissionRequestEnabled) return;
    await this.send(
      'Permission Required',
      `Action requires approval: ${action}`,
      { action },
    );
  }

  async onError(error: string): Promise<void> {
    if (!this.enabled || !this.onErrorEnabled) return;
    await this.send('Error', error);
  }

  configure(options: {
    enabled?: boolean;
    onTurnEnd?: boolean;
    onPermissionRequest?: boolean;
    onError?: boolean;
    silent?: boolean;
  }): void {
    if (options.enabled !== undefined) this.enabled = options.enabled;
    if (options.onTurnEnd !== undefined) this.onTurnEndEnabled = options.onTurnEnd;
    if (options.onPermissionRequest !== undefined)
      this.onPermissionRequestEnabled = options.onPermissionRequest;
    if (options.onError !== undefined) this.onErrorEnabled = options.onError;
    if (options.silent !== undefined) this.silent = options.silent;
  }
}
