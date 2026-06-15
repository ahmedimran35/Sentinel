import type { SentinelEvent } from '@sentinel/shared';
import type { EventBus } from './event-bus.js';

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

type PermissionResolver = (result: 'approved' | 'denied') => void;

export class InteractiveGate implements PermissionGate {
  private pendingRequests = new Map<string, PermissionResolver>();
  private unsub?: () => void;

  constructor(
    private emit: (event: SentinelEvent) => void,
    private bus?: EventBus,
  ) {
    if (this.bus) {
      this.unsub = this.bus.on('permission_response', (event) => {
        if (event.type !== 'permission_response') return;
        const resolver = this.pendingRequests.get(event.turnId);
        if (resolver) {
          this.pendingRequests.delete(event.turnId);
          resolver(event.response);
        }
      });
    }
  }

  async request(
    turnId: string,
    action: string,
    risk: string,
  ): Promise<'approved' | 'denied'> {
    if (risk === 'read') return 'approved';

    return new Promise<'approved' | 'denied'>((resolve) => {
      this.pendingRequests.set(turnId, resolve);
      this.emit({
        type: 'awaiting_permission',
        turnId,
        action,
        risk: `Flagged for approval (${risk})`,
      });
    });
  }

  destroy(): void {
    this.unsub?.();
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
