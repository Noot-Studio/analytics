// Deterministic PRNG so demo/test fixtures are fully reproducible.
// Seeding with the same number always yields the same event stream.

export interface Rng {
  /** Float in [0, 1). */
  next: () => number;
  /** Integer in [min, max] inclusive. */
  int: (min: number, max: number) => number;
  /** Float in [min, max). */
  float: (min: number, max: number) => number;
  /** True with the given probability (0..1). */
  chance: (probability: number) => boolean;
  /** Uniformly pick one element of a non-empty array. */
  pick: <T>(items: readonly T[]) => T;
}

const SINE_MAGNITUDE = 10_000;

export const createRng = (seed: number): Rng => {
  let state = seed;

  // Sine-based hash PRNG — bitwise-free and deterministic across JS engines.
  const next = (): number => {
    state += 1;
    const value = Math.sin(state) * SINE_MAGNITUDE;
    return value - Math.floor(value);
  };

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  const float = (min: number, max: number): number =>
    min + next() * (max - min);

  const chance = (probability: number): boolean => next() < probability;

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("createRng.pick: cannot pick from an empty array");
    }
    return items[int(0, items.length - 1)] as T;
  };

  return { chance, float, int, next, pick };
};
