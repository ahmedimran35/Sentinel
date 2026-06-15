import { describe, it, expect } from 'vitest';
import { VariantCycler } from './variant-cycler.js';

describe('VariantCycler', () => {
  it('addVariant and getVariants', () => {
    const vc = new VariantCycler();
    const id = vc.addVariant('t1', 'hello');
    const variants = vc.getVariants('t1');
    expect(variants).toHaveLength(1);
    expect(variants[0]!.id).toBe(id);
    expect(variants[0]!.content).toBe('hello');
    expect(variants[0]!.turnId).toBe('t1');
    expect(variants[0]!.timestamp).toBeInstanceOf(Date);
  });

  it('cycleNext wraps around', () => {
    const vc = new VariantCycler();
    vc.addVariant('t1', 'a');
    vc.addVariant('t1', 'b');
    vc.addVariant('t1', 'c');

    expect(vc.getCurrentVariant('t1')!.content).toBe('c');
    expect(vc.cycleNext('t1')!.content).toBe('a');
    expect(vc.cycleNext('t1')!.content).toBe('b');
    expect(vc.cycleNext('t1')!.content).toBe('c');
    expect(vc.cycleNext('t1')!.content).toBe('a');
  });

  it('cyclePrev wraps around', () => {
    const vc = new VariantCycler();
    vc.addVariant('t1', 'a');
    vc.addVariant('t1', 'b');

    expect(vc.getCurrentVariant('t1')!.content).toBe('b');
    expect(vc.cyclePrev('t1')!.content).toBe('a');
    expect(vc.cyclePrev('t1')!.content).toBe('b');
    expect(vc.cyclePrev('t1')!.content).toBe('a');
  });

  it('selectVariant by ID', () => {
    const vc = new VariantCycler();
    const id1 = vc.addVariant('t1', 'x');
    vc.addVariant('t1', 'y');

    const sel = vc.selectVariant('t1', id1);
    expect(sel!.content).toBe('x');
    expect(vc.getCurrentVariant('t1')!.content).toBe('x');

    expect(vc.selectVariant('t1', 'nope')).toBeNull();
  });

  it('clear', () => {
    const vc = new VariantCycler();
    vc.addVariant('t1', 'a');
    vc.clear('t1');
    expect(vc.getVariants('t1')).toHaveLength(0);
    expect(vc.getCurrentVariant('t1')).toBeNull();
    expect(vc.cycleNext('t1')).toBeNull();
    expect(vc.cyclePrev('t1')).toBeNull();
  });

  it('max variants eviction', () => {
    const vc = new VariantCycler();
    for (let i = 0; i < 12; i++) {
      vc.addVariant('t1', `v${i}`);
    }
    const variants = vc.getVariants('t1');
    expect(variants).toHaveLength(10);
    expect(variants[0]!.content).toBe('v2');
    expect(variants[9]!.content).toBe('v11');
  });

  it('getCurrentVariant returns null for empty turn', () => {
    const vc = new VariantCycler();
    expect(vc.getCurrentVariant('nonexistent')).toBeNull();
  });

  it('setCount initializes empty variant list', () => {
    const vc = new VariantCycler();
    vc.setCount('t1', 3);
    expect(vc.getVariants('t1')).toHaveLength(0);
    expect(vc.getCurrentVariant('t1')).toBeNull();
  });
});
