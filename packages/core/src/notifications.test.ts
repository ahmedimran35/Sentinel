import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendNotification, NotificationManager } from './notifications.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('mock failure');
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('SENTINEL_NOTIFICATIONS_ENABLED', 'true');
  vi.stubEnv('SENTINEL_NOTIFICATIONS_SILENT', 'false');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('sendNotification', () => {
  it('does not throw', async () => {
    await expect(
      sendNotification('Test', 'Hello world'),
    ).resolves.toBeUndefined();
  });

  it('is throttled (second call within 5s is skipped)', async () => {
    const logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.advanceTimersByTime(10_000);

    await sendNotification('Test', 'First');
    expect(logSpy).toHaveBeenCalledTimes(1);

    await sendNotification('Test', 'Second');
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it('deduplicates identical messages within 30s', async () => {
    const logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    vi.advanceTimersByTime(20_000);

    await sendNotification('Same', 'Message');
    expect(logSpy).toHaveBeenCalledTimes(1);

    await sendNotification('Same', 'Message');
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });
});

describe('NotificationManager', () => {
  it('send delegates to sendNotification', async () => {
    const mgr = new NotificationManager();
    await expect(mgr.send('Test', 'Body')).resolves.toBeUndefined();
  });

  it('onTurnEnd sends notification', async () => {
    const mgr = new NotificationManager();
    const spy = vi.spyOn(mgr, 'send').mockImplementation(async () => {});

    await mgr.onTurnEnd('t1', 'success');
    expect(spy).toHaveBeenCalledWith(
      'Turn Complete',
      'Turn t1 finished with status: success',
    );

    spy.mockRestore();
  });

  it('onPermissionRequest sends notification', async () => {
    const mgr = new NotificationManager();
    const spy = vi.spyOn(mgr, 'send').mockImplementation(async () => {});

    await mgr.onPermissionRequest('write_file');
    expect(spy).toHaveBeenCalledWith(
      'Permission Required',
      'Action requires approval: write_file',
      { action: 'write_file' },
    );

    spy.mockRestore();
  });

  it('onError sends notification', async () => {
    const mgr = new NotificationManager();
    const spy = vi.spyOn(mgr, 'send').mockImplementation(async () => {});

    await mgr.onError('something broke');
    expect(spy).toHaveBeenCalledWith('Error', 'something broke');

    spy.mockRestore();
  });

  it('configure updates settings', async () => {
    const mgr = new NotificationManager();
    const spy = vi.spyOn(mgr, 'send').mockImplementation(async () => {});

    mgr.configure({ onError: false });
    await mgr.onError('should not appear');
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
