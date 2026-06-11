import { describe, expect, it } from "bun:test";

import { evaluateCrashSpike, evaluateDauDrop } from "./evaluate";

describe("evaluateCrashSpike", () => {
  it("fires when crashes reach the threshold", () => {
    expect(evaluateCrashSpike(5, 5).fired).toBe(true);
    expect(evaluateCrashSpike(6, 5).fired).toBe(true);
  });

  it("does not fire below the threshold", () => {
    expect(evaluateCrashSpike(4, 5).fired).toBe(false);
  });

  it("clamps a zero threshold to 1 so no crashes never fires", () => {
    expect(evaluateCrashSpike(0, 0).fired).toBe(false);
    expect(evaluateCrashSpike(1, 0).fired).toBe(true);
  });
});

describe("evaluateDauDrop", () => {
  it("fires when the drop meets the percent threshold", () => {
    // 100 -> 50 is a 50% drop.
    expect(evaluateDauDrop(50, 100, 50).fired).toBe(true);
    expect(evaluateDauDrop(40, 100, 50).fired).toBe(true);
  });

  it("does not fire for a shallower drop", () => {
    expect(evaluateDauDrop(70, 100, 50).fired).toBe(false);
  });

  it("never fires without a baseline", () => {
    expect(evaluateDauDrop(0, 0, 50).fired).toBe(false);
  });

  it("does not fire when activity grows", () => {
    expect(evaluateDauDrop(150, 100, 20).fired).toBe(false);
  });
});
