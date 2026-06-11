import { describe, expect, it } from "bun:test";

import { evaluateThreshold } from "./evaluate";

describe("evaluateThreshold", () => {
  it("fires Above at or over the threshold", () => {
    expect(evaluateThreshold(10, "Above", 10, "Crashes").fired).toBe(true);
    expect(evaluateThreshold(11, "Above", 10, "Crashes").fired).toBe(true);
  });

  it("does not fire Above under the threshold", () => {
    expect(evaluateThreshold(9, "Above", 10, "Crashes").fired).toBe(false);
  });

  it("fires Below at or under the threshold", () => {
    expect(evaluateThreshold(30, "Below", 30, "Avg FPS").fired).toBe(true);
    expect(evaluateThreshold(20, "Below", 30, "Avg FPS").fired).toBe(true);
  });

  it("does not fire Below over the threshold", () => {
    expect(evaluateThreshold(31, "Below", 30, "Avg FPS").fired).toBe(false);
  });

  it("summarizes the observed value rounded to two decimals", () => {
    expect(evaluateThreshold(12.345, "Above", 10, "Crashes").summary).toBe(
      "Crashes is 12.35 (threshold ≥ 10)."
    );
    expect(evaluateThreshold(7, "Below", 30, "Avg FPS").summary).toBe(
      "Avg FPS is 7 (threshold ≤ 30)."
    );
  });
});
