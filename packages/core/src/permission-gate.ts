import type { SentinelEvent } from '@sentinel/shared';

export interface PermissionGate {
  request(
    turnId: string,
    action: string,
    risk: string,
  ): Promise<'approved' | 'denied'>;
}

export class AlwaysAllowGate implements PermissionGate {
  async request(): Promise<'approved' | 'denied'> {
    return 'approved';
  }
}

export class EmittingGate implements PermissionGate {
  constructor(private emit: (event: SentinelEvent) => void) {}

  async request(
    turnId: string,
    action: string,
    risk: string,
  ): Promise<'approved' | 'denied'> {
    return new Promise((resolve) => {
      this.emit({ type: 'awaiting_permission', turnId, action, risk });
      resolve('approved');
    });
  }
}
