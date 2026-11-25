// Deterministic Random Number Generator.

export class RNG {
  private s: number;

  constructor(seed: number = Date.now()) {
    this.s = seed >>> 0;
  }

  seed(s: number): void {
    this.s = s >>> 0;
  }

  // Returns float in [0, 1)
  randf(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in [from, to] inclusive
  randiRange(from: number, to: number): number {
    if (from > to) [from, to] = [to, from];
    return from + Math.floor(this.randf() * (to - from + 1));
  }

  // Normal distribution using Box-Muller transform
  randfn(mean: number = 0.0, dev: number = 1.0): number {
    let u1 = this.randf();
    let u2 = this.randf();
    while (u1 <= 1e-15) u1 = this.randf();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * dev;
  }

  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randiRange(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  sample<T>(arr: T[], k: number): T[] {
    const copy = [...arr];
    this.shuffle(copy);
    return copy.slice(0, k);
  }

  weightedChoice<T>(items: T[], weights: number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    const r = this.randf() * total;
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  }
}
