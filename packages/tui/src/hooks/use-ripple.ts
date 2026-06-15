import { useState, useRef, useCallback, useEffect } from 'react';

const RIPPLE_BASE_SIZE = 20;
const RIPPLE_SIZE_VARY = 10;
const RIPPLE_GROW_SPEED = 0.4;
const RIPPLE_FADE_RATE = 0.02;

export interface Ripple {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
}

export interface UseRippleResult {
  ripples: Ripple[];
  trigger: (x: number, y: number, color?: string) => void;
}

export function useRipple(isActive = true): UseRippleResult {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);
  const ripplesRef = useRef<Ripple[]>([]);

  const trigger = useCallback((x: number, y: number, color?: string) => {
    idRef.current++;
    const newRipple: Ripple = {
      id: idRef.current,
      x,
      y,
      radius: 1,
      maxRadius: RIPPLE_BASE_SIZE + Math.random() * RIPPLE_SIZE_VARY,
      opacity: 0.8,
      color: color ?? '#a855f7',
    };
    ripplesRef.current = [...ripplesRef.current, newRipple];
    setRipples(ripplesRef.current);
  }, []);

  useEffect(() => {
    if (!isActive) {
      ripplesRef.current = [];
      setRipples([]);
      return;
    }

    const interval = setInterval(() => {
      const dt = 30;
      const growSpeed = RIPPLE_GROW_SPEED;
      const fadeSpeed = RIPPLE_FADE_RATE;

      const updated = ripplesRef.current
        .map((r) => ({
          ...r,
          radius: r.radius + growSpeed * (dt / 30),
          opacity: r.opacity - fadeSpeed * (dt / 30),
        }))
        .filter((r) => r.opacity > 0 && r.radius < r.maxRadius);

      ripplesRef.current = updated;
      setRipples(updated);
    }, 30);

    return () => clearInterval(interval);
  }, [isActive]);

  return { ripples, trigger };
}
