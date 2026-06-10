export type Mode = 'plan' | 'build' | 'auto' | 'yolo';

export interface ModeConfig {
  label: string;
  color: string;
  allowWrite: boolean;
  allowExecute: boolean;
  allowNetwork: boolean;
  requirePermission: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  plan: {
    label: 'PLAN',
    color: 'blue',
    allowWrite: false,
    allowExecute: false,
    allowNetwork: true,
    requirePermission: true,
  },
  build: {
    label: 'BUILD',
    color: 'green',
    allowWrite: true,
    allowExecute: true,
    allowNetwork: true,
    requirePermission: true,
  },
  auto: {
    label: 'AUTO',
    color: 'yellow',
    allowWrite: true,
    allowExecute: true,
    allowNetwork: true,
    requirePermission: false,
  },
  yolo: {
    label: 'YOLO',
    color: 'red',
    allowWrite: true,
    allowExecute: true,
    allowNetwork: true,
    requirePermission: false,
  },
};

export function checkModePermission(
  mode: Mode,
  risk: 'read' | 'write' | 'execute' | 'network',
): boolean {
  const cfg = MODES[mode];
  switch (risk) {
    case 'read': return true;
    case 'write': return cfg.allowWrite;
    case 'execute': return cfg.allowExecute;
    case 'network': return cfg.allowNetwork;
  }
}
