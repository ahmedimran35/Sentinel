import { useState, useRef, useCallback, useEffect } from 'react';

const FRAME_TARGET_MS = 1000 / 60;

export interface ScrollAcceleratorConfig {
  initialDecay?: number;
  accelerationFactor?: number;
  maxVelocity?: number;
}

export class ScrollAccelerator {
  private velocity = 0;
  private config: Required<ScrollAcceleratorConfig>;
  private static readonly MAX_SCROLL_DISTANCE = 50;
  private static readonly SMOOTH_SCROLL_THRESHOLD = 5;
  private static readonly VELOCITY_EPSILON = 0.01;

  constructor(config?: ScrollAcceleratorConfig) {
    this.config = {
      initialDecay: config?.initialDecay ?? 0.85,
      accelerationFactor: config?.accelerationFactor ?? 1.2,
      maxVelocity: config?.maxVelocity ?? 20,
    };
  }

  onScroll(direction: 1 | -1, delta?: number): number {
    const step = delta ?? 1;
    const absVel = Math.min(
      Math.abs(this.velocity) + this.config.accelerationFactor * step,
      this.config.maxVelocity
    );
    this.velocity = absVel * direction;

    if (absVel <= ScrollAccelerator.SMOOTH_SCROLL_THRESHOLD) {
      return direction;
    }

    return Math.min(Math.ceil(absVel), ScrollAccelerator.MAX_SCROLL_DISTANCE) * direction;
  }

  reset(): void {
    this.velocity = 0;
  }

  update(dt: number): void {
    this.velocity *= Math.pow(this.config.initialDecay, dt * 60);
    if (Math.abs(this.velocity) < ScrollAccelerator.VELOCITY_EPSILON) {
      this.velocity = 0;
    }
  }

  getVelocity(): number {
    return this.velocity;
  }
}

export function useScrollAcceleration(): {
  scrollDistance: number;
  onUserScroll: (direction: 1 | -1) => void;
  reset: () => void;
} {
  const accelRef = useRef<ScrollAccelerator>(new ScrollAccelerator());
  const [scrollDistance, setScrollDistance] = useState(0);

  const onUserScroll = useCallback((direction: 1 | -1) => {
    const dist = accelRef.current.onScroll(direction);
    setScrollDistance(dist);
  }, []);

  const reset = useCallback(() => {
    accelRef.current.reset();
    setScrollDistance(0);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      accelRef.current.update(1 / 60);
    }, FRAME_TARGET_MS);
    return () => clearInterval(interval);
  }, []);

  return { scrollDistance, onUserScroll, reset };
}
