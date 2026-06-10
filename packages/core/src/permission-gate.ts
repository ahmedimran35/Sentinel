import type { SentinelEvent } from '@sentinel/shared';

export interface PermissionGate {
  request(
    turnId: string,
    action: string,
    risk: string,
  ): Promise<'approved' | 'denied'>;
}

export class AlwaysAllowGate implements PermissionGate {
  async request(
    _turnId: string,
    _action: string,
    _risk: string,
  ): Promise<'approved' | 'denied'> {
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
      const event: SentinelEvent = {
        type: 'awaiting_permission',
        turnId,
        action,
        risk,
      };
      this.emit(event);
      resolve('approved');
    });
  }
}
