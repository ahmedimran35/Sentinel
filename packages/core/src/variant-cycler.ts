const MAX_VARIANTS_PER_TURN = 10;

function shortId(): string {
  return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
}

export interface Variant {
  id: string;
  content: string;
  timestamp: Date;
  turnId: string;
}

export class VariantCycler {
  private store = new Map<string, Variant[]>();
  private pointers = new Map<string, number>();

  addVariant(turnId: string, content: string): string {
    let variants = this.store.get(turnId);
    if (!variants) {
      variants = [];
      this.store.set(turnId, variants);
      this.pointers.set(turnId, 0);
    }

    let id = shortId();
    while (variants.some(v => v.id === id)) {
      id = shortId();
    }

    const variant: Variant = { id, content, timestamp: new Date(), turnId };
    variants.push(variant);

    if (variants.length > MAX_VARIANTS_PER_TURN) {
      variants.shift();
    }

    this.pointers.set(turnId, variants.length - 1);
    return id;
  }

  getVariants(turnId: string): Variant[] {
    return this.store.get(turnId) ?? [];
  }

  getCurrentVariant(turnId: string): Variant | null {
    const variants = this.store.get(turnId);
    if (!variants || variants.length === 0) return null;
    const idx = this.pointers.get(turnId) ?? 0;
    return variants[idx] ?? null;
  }

  cycleNext(turnId: string): Variant | null {
    const variants = this.store.get(turnId);
    if (!variants || variants.length === 0) return null;
    const idx = ((this.pointers.get(turnId) ?? 0) + 1) % variants.length;
    this.pointers.set(turnId, idx);
    return variants[idx] ?? null;
  }

  cyclePrev(turnId: string): Variant | null {
    const variants = this.store.get(turnId);
    if (!variants || variants.length === 0) return null;
    const len = variants.length;
    const idx = (((this.pointers.get(turnId) ?? 0) - 1) + len) % len;
    this.pointers.set(turnId, idx);
    return variants[idx] ?? null;
  }

  selectVariant(turnId: string, variantId: string): Variant | null {
    const variants = this.store.get(turnId);
    if (!variants) return null;
    const idx = variants.findIndex(v => v.id === variantId);
    if (idx === -1) return null;
    this.pointers.set(turnId, idx);
    return variants[idx] ?? null;
  }

  setCount(turnId: string, count: number): void {
    if (count < 0) return;
    // Request N variants — actual generation happens externally.
    // Just ensure the store entry exists.
    if (!this.store.has(turnId)) {
      this.store.set(turnId, []);
      this.pointers.set(turnId, 0);
    }
  }

  clear(turnId: string): void {
    this.store.delete(turnId);
    this.pointers.delete(turnId);
  }
}
