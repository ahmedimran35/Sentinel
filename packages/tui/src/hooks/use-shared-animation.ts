import { useRef, useState, useEffect } from 'react';

/**
 * Shared animation tick — a single setInterval drives all animation.
 * Components subscribe at their desired frame rate and only re-render
 * when a new frame is due. Eliminates N concurrent intervals.
 */

let tick = 0;
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
const frameListeners = new Set<() => void>();
const INTERVAL_MS = 16;

function start() {
  if (started) return;
  started = true;
  intervalId = setInterval(() => {
    tick++;
    if (frameListeners.size === 0) {
      clearInterval(intervalId!);
      intervalId = null;
      started = false;
      return;
    }
    const ls = Array.from(frameListeners);
    for (const fn of ls) fn();
  }, INTERVAL_MS);
}

interface SharedAnimationResult {
  frame: number;
  time: number;
}

function useForceRender(): () => void {
  const [, setState] = useState(0);
  return () => setState((n) => n + 1);
}

/**
 * Subscribe to the shared animation tick. Component only re-renders
 * every `interval` ms rather than on every 16ms tick.
 */
export function useSharedAnimation(interval = 80, isActive = true): SharedAnimationResult {
  const lastRenderRef = useRef(0);
  const forceRender = useForceRender();
  const intervalMs = Math.max(interval, 16);

  useEffect(() => {
    if (!isActive) return;

    const handler = () => {
      const now = performance.now();
      if (now - lastRenderRef.current < intervalMs) return;
      lastRenderRef.current = now;
      forceRender();
    };

    frameListeners.add(handler);
    start();
    return () => { frameListeners.delete(handler); };
  }, [intervalMs, isActive, forceRender]);

  return {
    frame: tick,
    time: tick * INTERVAL_MS,
  };
}

/**
 * Rotate through frames at given rate. Uses shared tick.
 */
export function useSharedSpinner(frames: string[], interval = 120, isActive = true): string {
  const { frame } = useSharedAnimation(interval, isActive);
  return frames[frame % frames.length] ?? frames[0]!;
}

/**
 * Returns 0..1 sine wave pulse. Uses shared tick.
 */
export function useSharedPulse(isActive = true): number {
  const { time } = useSharedAnimation(16, isActive);
  return (Math.sin(time / 300) + 1) / 2;
}
