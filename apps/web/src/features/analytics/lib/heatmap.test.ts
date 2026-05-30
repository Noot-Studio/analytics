import { describe, expect, it } from "bun:test";

import { buildHeatmapGrid } from "./heatmap";

describe("buildHeatmapGrid", () => {
  it("fills a 7x24 grid with zeros for missing cells", () => {
    const grid = buildHeatmapGrid([]);
    expect(grid.rows).toHaveLength(7);
    expect(grid.rows[0].cells).toHaveLength(24);
    expect(grid.rows[0].cells[0]).toBe(0);
    expect(grid.max).toBe(0);
  });

  it("places counts at the correct weekday/hour and tracks the max", () => {
    const grid = buildHeatmapGrid([
      { hour: 0, sessions: 5, weekday: 1 },
      { hour: 23, sessions: 9, weekday: 7 },
    ]);
    expect(grid.rows[0].cells[0]).toBe(5);
    expect(grid.rows[6].cells[23]).toBe(9);
    expect(grid.max).toBe(9);
  });

  it("ignores out-of-range cells defensively", () => {
    const grid = buildHeatmapGrid([{ hour: 99, sessions: 3, weekday: 0 }]);
    expect(grid.max).toBe(0);
  });
});
