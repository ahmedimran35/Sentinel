import { useSharedAnimation, useSharedSpinner, useSharedPulse } from './use-shared-animation.js';

export interface UseAnimationOptions {
  interval?: number;
  isActive?: boolean;
}

export interface AnimationResult {
  frame: number;
  time: number;
  delta: number;
  reset: () => void;
}

/**
 * useAnimation delegates to the shared animation tick internally.
 * All animated components now share a single setInterval instead of
 * creating N concurrent intervals.
 */
export function useAnimation(options?: UseAnimationOptions): AnimationResult {
  const { interval = 80, isActive = true } = options ?? {};
  const { frame, time } = useSharedAnimation(interval, isActive);

  return {
    frame,
    time,
    delta: interval,
    reset: () => { /* no-op — shared tick resets aren't supported */ },
  };
}

export function useSpinner(frames: string[], interval = 120, isActive = true): string {
  return useSharedSpinner(frames, interval, isActive);
}

export function usePulse(isActive = true): number {
  return useSharedPulse(isActive);
}
