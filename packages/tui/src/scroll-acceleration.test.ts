import { describe, it, expect } from 'vitest';
import { ScrollAccelerator } from './scroll-acceleration.js';

describe('ScrollAccelerator', () => {
  it('should start with zero velocity', () => {
    const accel = new ScrollAccelerator();
    expect(accel.getVelocity()).toBe(0);
  });

  it('should return base distance at low velocity', () => {
    const accel = new ScrollAccelerator();
    const dist = accel.onScroll(1);
    expect(dist).toBe(1);
    expect(accel.getVelocity()).toBeGreaterThan(0);
  });

  it('should build up velocity with repeated scrolls', () => {
    const accel = new ScrollAccelerator();
    accel.onScroll(1);
    const v1 = accel.getVelocity();
    accel.onScroll(1);
    const v2 = accel.getVelocity();
    accel.onScroll(1);
    const v3 = accel.getVelocity();
    expect(v3).toBeGreaterThan(v2);
    expect(v2).toBeGreaterThan(v1);
  });

  it('should return scroll distance > 1 when velocity exceeds threshold', () => {
    const accel = new ScrollAccelerator();
    let dist = 0;
    for (let i = 0; i < 10; i++) {
      dist = accel.onScroll(1);
    }
    expect(dist).toBeGreaterThan(1);
    expect(accel.getVelocity()).toBeGreaterThan(5);
  });

  it('should decay velocity over time', () => {
    const accel = new ScrollAccelerator();
    accel.onScroll(1);
    accel.onScroll(1);
    accel.onScroll(1);
    const vBefore = accel.getVelocity();
    accel.update(1 / 60);
    const vAfter = accel.getVelocity();
    expect(vAfter).toBeLessThan(vBefore);
  });

  it('should decay velocity to near zero over many frames', () => {
    const accel = new ScrollAccelerator();
    accel.onScroll(1);
    accel.onScroll(1);
    expect(accel.getVelocity()).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) {
      accel.update(1 / 60);
    }
    expect(accel.getVelocity()).toBe(0);
  });

  it('should reset velocity to zero', () => {
    const accel = new ScrollAccelerator();
    accel.onScroll(1);
    accel.onScroll(1);
    expect(accel.getVelocity()).toBeGreaterThan(0);
    accel.reset();
    expect(accel.getVelocity()).toBe(0);
  });

  it('should reset clears scroll distance to base', () => {
    const accel = new ScrollAccelerator();
    for (let i = 0; i < 10; i++) {
      accel.onScroll(1);
    }
    expect(accel.getVelocity()).toBeGreaterThan(5);
    accel.reset();
    const dist = accel.onScroll(1);
    expect(dist).toBe(1);
  });

  it('should cap velocity at maxVelocity', () => {
    const accel = new ScrollAccelerator({ maxVelocity: 5, accelerationFactor: 10 });
    accel.onScroll(1);
    accel.onScroll(1);
    expect(accel.getVelocity()).toBeLessThanOrEqual(5);
  });

  it('should cap scroll distance at 50', () => {
    const accel = new ScrollAccelerator({ maxVelocity: 100, accelerationFactor: 100 });
    const dist = accel.onScroll(1);
    expect(dist).toBeLessThanOrEqual(50);
  });

  it('should handle negative direction (scroll up)', () => {
    const accel = new ScrollAccelerator();
    const dist = accel.onScroll(-1);
    expect(dist).toBe(-1);
    expect(accel.getVelocity()).toBeLessThan(0);
  });

  it('should return negative distance for scroll up at high velocity', () => {
    const accel = new ScrollAccelerator();
    for (let i = 0; i < 10; i++) {
      accel.onScroll(-1);
    }
    const dist = accel.onScroll(-1);
    expect(dist).toBeLessThan(-1);
    expect(accel.getVelocity()).toBeLessThan(-5);
  });

  it('should respect custom acceleration factor', () => {
    const accel = new ScrollAccelerator({ accelerationFactor: 5 });
    accel.onScroll(1);
    expect(accel.getVelocity()).toBe(5);
    accel.onScroll(1);
    expect(accel.getVelocity()).toBe(10);
  });

  it('should respect custom decay factor', () => {
    const accel = new ScrollAccelerator({ initialDecay: 0.5, accelerationFactor: 10 });
    accel.onScroll(1);
    expect(accel.getVelocity()).toBe(10);
    accel.update(2 / 60);
    expect(accel.getVelocity()).toBeLessThan(5);
  });
});
