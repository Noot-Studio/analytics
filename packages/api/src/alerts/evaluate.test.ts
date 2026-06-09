import { describe, expect, it } from "bun:test";

import { evaluateCrashSpike, evaluateDauDrop } from "./evaluate";

describe("evaluateCrashSpike", () => {
  it("does not fire below the threshold", () => {
    expect(evaluateCrashSpike(10, { crashes: 9 })).toBeNull();
  });

  it("fires at the threshold, reporting the observed count", () => {
    const breach = evaluateCrashSpike(10, { crashes: 10 });
    expect(breach).not.toBeNull();
    expect(breach?.value).toBe(10);
    expect(breach?.threshold).toBe(10);
  });

  it("fires above the threshold", () => {
    expect(evaluateCrashSpike(10, { crashes: 25 })?.value).toBe(25);
  });
});

describe("evaluateDauDrop", () => {
  it("does not fire without a baseline to drop from", () => {
    expect(evaluateDauDrop(30, { baselineDau: 0, currentDau: 0 })).toBeNull();
  });

  it("does not fire when the drop is smaller than the threshold", () => {
    // 100 -> 71 is a 29% drop, below the 30% threshold.
    expect(
      evaluateDauDrop(30, { baselineDau: 100, currentDau: 71 })
    ).toBeNull();
  });

  it("does not fire when DAU grows", () => {
    expect(
      evaluateDauDrop(30, { baselineDau: 100, currentDau: 140 })
    ).toBeNull();
  });

  it("fires at the threshold, reporting the rounded drop percent", () => {
    // 100 -> 70 is exactly a 30% drop.
    const breach = evaluateDauDrop(30, { baselineDau: 100, currentDau: 70 });
    expect(breach).not.toBeNull();
    expect(breach?.value).toBe(30);
    expect(breach?.threshold).toBe(30);
  });

  it("fires above the threshold", () => {
    const breach = evaluateDauDrop(30, { baselineDau: 200, currentDau: 50 });
    expect(breach?.value).toBe(75);
  });
});
