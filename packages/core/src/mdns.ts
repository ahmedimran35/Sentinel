import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export interface PublishOptions {
  name: string;
  type: string;
  port: number;
  hostname?: string;
}

export interface DiscoveredService {
  name: string;
  host: string;
  port: number;
}

const isMac = platform() === 'darwin';
const isLinux = platform() === 'linux';
const isWindows = platform() === 'win32';

function hasBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [bin], { stdio: 'ignore' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function findDnsSdBinary(): Promise<string | null> {
  if (isMac) return '/usr/bin/dns-sd';
  if (isLinux) {
    const hasAvahi = await hasBinary('avahi-publish-service');
    if (hasAvahi) return 'avahi-publish-service';
    return null;
  }
  return null;
}

async function findBrowseBinary(): Promise<string | null> {
  if (isMac) return '/usr/bin/dns-sd';
  if (isLinux) {
    const hasAvahi = await hasBinary('avahi-browse');
    if (hasAvahi) return 'avahi-browse';
    return null;
  }
  return null;
}

export async function publishService(opts: PublishOptions): Promise<{ unpublish: () => void }> {
  if (isWindows) {
    console.warn('[mdns] mDNS not supported on Windows');
    return { unpublish() {} };
  }

  const bin = await findDnsSdBinary();
  if (!bin) {
    console.warn('[mdns] No mDNS publish binary found (dns-sd or avahi-publish-service)');
    return { unpublish() {} };
  }

  let proc: ReturnType<typeof spawn> | null = null;

  if (bin === '/usr/bin/dns-sd') {
    const args = ['-R', opts.name, opts.type, '.', String(opts.port)];
    if (opts.hostname) args.push(...['-H', opts.hostname]);
    proc = spawn(bin, args, { stdio: 'ignore' });
  } else if (bin === 'avahi-publish-service') {
    const args = [opts.name, opts.type, String(opts.port)];
    if (opts.hostname) args.push('--host', opts.hostname);
    proc = spawn(bin, args, { stdio: 'ignore' });
  }

  proc?.unref();

  return {
    unpublish() {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        proc = null;
      }
    },
  };
}

export async function discoverServices(type: string, timeout = 5000): Promise<DiscoveredService[]> {
  if (isWindows) {
    console.warn('[mdns] mDNS not supported on Windows');
    return [];
  }

  const bin = await findBrowseBinary();
  if (!bin) {
    console.warn('[mdns] No mDNS browse binary found (dns-sd or avahi-browse)');
    return [];
  }

  if (bin === '/usr/bin/dns-sd') {
    return discoverDnsSd(type, timeout);
  }

  if (bin === 'avahi-browse') {
    return discoverAvahi(type, timeout);
  }

  return [];
}

function discoverDnsSd(type: string, timeout: number): Promise<DiscoveredService[]> {
  return new Promise((resolvePromise) => {
    const results: DiscoveredService[] = [];
    const proc = spawn('/usr/bin/dns-sd', ['-B', type, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let resolved = false;

    const timer = setTimeout(() => {
      resolved = true;
      proc.kill('SIGTERM');
      resolvePromise(results);
    }, timeout);

    proc.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolvePromise([]);
      }
    });

    proc.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolvePromise(results);
      }
    });

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('\t')) {
          const cols = line.split('\t');
          const name = cols[6]?.trim();
          if (name) {
            results.push({ name, host: '', port: 0 });
          }
        } else {
          const parts = line.trim().split(/\s{2,}/);
          if (parts.length >= 7) {
            const name = parts[6]?.trim();
            if (name && !name.startsWith('Instance')) {
              results.push({ name, host: '', port: 0 });
            }
          }
        }
      }
    });
  });
}

function discoverAvahi(type: string, timeout: number): Promise<DiscoveredService[]> {
  return new Promise((resolvePromise) => {
    const results: DiscoveredService[] = [];
    const proc = spawn('avahi-browse', ['-tpr', type], { stdio: ['ignore', 'pipe', 'pipe'] });
    let resolved = false;

    const timer = setTimeout(() => {
      resolved = true;
      proc.kill('SIGTERM');
      resolvePromise(results);
    }, timeout);

    proc.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolvePromise([]);
      }
    });

    proc.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolvePromise(results);
      }
    });

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const parts = line.split(';');
        if (parts.length >= 8 && parts[0] === '=') {
          results.push({
            name: parts[3] ?? '',
            host: parts[6] ?? '',
            port: parseInt(parts[8]?.trim() ?? '0', 10),
          });
        }
      }
    });
  });
}
