import { useState, useEffect, useRef, useCallback } from 'react';

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  size: number;
  opacity: number;
  color: 'brand' | 'info' | 'success' | 'warning' | 'dim';
  life: number;
  maxLife: number;
}

export interface ParticleSystemOptions {
  count?: number;
  width: number;
  height: number;
  isActive?: boolean;
}

export interface ParticleSystemResult {
  particles: Particle[];
  emit: (x: number, y: number, count?: number, color?: Particle['color']) => void;
  burst: (color?: Particle['color']) => void;
}

const PARTICLE_CHARS = ['\u25CB', '\u25CF', '\u25D8', '\u25D9', '\u2219', '\u00B7', '\u0660', '*'];
const COLORS: Particle['color'][] = ['brand', 'info', 'success', 'warning', 'dim'];
const PARTICLE_SPAWN_SPEED_X = 0.5;
const PARTICLE_SPAWN_VY_BASE = 0.8;
const PARTICLE_SPAWN_VY_VARY = 0.2;
const PARTICLE_LIFE_BASE = 2000;
const PARTICLE_LIFE_VARY = 2000;
const PARTICLE_FRAME_FACTOR = 60;

function randomColor(): Particle['color'] {
  return COLORS[Math.floor(Math.random() * COLORS.length)]!;
}

export function useParticleSystem(options: ParticleSystemOptions): ParticleSystemResult {
  const { count = 30, width, height, isActive = true } = options;
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  const spawn = useCallback((x: number, y: number, n = 3, color?: Particle['color']) => {
    const newP: Particle[] = [];
    for (let i = 0; i < n; i++) {
      idRef.current++;
      newP.push({
        id: idRef.current,
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * PARTICLE_SPAWN_SPEED_X,
        vy: -Math.random() * PARTICLE_SPAWN_VY_BASE - PARTICLE_SPAWN_VY_VARY,
        char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)]!,
        size: Math.random() > 0.7 ? 2 : 1,
        opacity: 0.6 + Math.random() * 0.4,
        color: color ?? randomColor(),
        life: 0,
        maxLife: PARTICLE_LIFE_BASE + Math.random() * PARTICLE_LIFE_VARY,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newP];
    setParticles(particlesRef.current);
  }, []);

  const burst = useCallback((color?: Particle['color']) => {
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      idRef.current++;
      const newP: Particle = {
        id: idRef.current,
        x: width / 2,
        y: height / 2,
        vx: Math.cos(angle) * 1.2,
        vy: Math.sin(angle) * 1.2,
        char: '\u25CF',
        size: 1,
        opacity: 1,
        color: color ?? 'brand',
        life: 0,
        maxLife: 1500 + Math.random() * 500,
      };
      particlesRef.current = [...particlesRef.current, newP];
    }
    setParticles(particlesRef.current);
  }, [width, height]);

  useEffect(() => {
    if (!isActive) {
      particlesRef.current = [];
      setParticles([]);
      return;
    }

    const interval = setInterval(() => {
      const dt = 50;
      const updated = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx * (dt / 1000) * PARTICLE_FRAME_FACTOR,
          y: p.y + p.vy * (dt / 1000) * PARTICLE_FRAME_FACTOR,
          life: p.life + dt,
        }))
        .filter((p) => p.life < p.maxLife && p.y > -2 && p.x > -2 && p.x < width + 2);

      if (updated.length < count && Math.random() < 0.3) {
        idRef.current++;
        updated.push({
          id: idRef.current,
          x: Math.random() * width,
          y: height + 1,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -Math.random() * 0.4 - 0.1,
          char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)]!,
          size: 1,
          opacity: 0.3 + Math.random() * 0.4,
          color: randomColor(),
          life: 0,
          maxLife: 3000 + Math.random() * 4000,
        });
      }

      particlesRef.current = updated;
      setParticles(updated);
    }, 50);

    return () => clearInterval(interval);
  }, [count, width, height, isActive]);

  return { particles, emit: spawn, burst };
}
