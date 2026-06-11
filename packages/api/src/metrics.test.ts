import { describe, expect, it } from "bun:test";

import {
  compatibleVisualizations,
  defaultVisualization,
  resultShape,
} from "./metrics";

describe("resultShape", () => {
  it("is scalar without granularity or group-by", () => {
    expect(resultShape({ granularity: "none" })).toBe("scalar");
  });

  it("is series with a time granularity", () => {
    expect(resultShape({ granularity: "day" })).toBe("series");
  });

  it("is groups with group-by and no granularity", () => {
    expect(resultShape({ granularity: "none", groupBy: ["weapon"] })).toBe(
      "groups"
    );
  });

  it("is grouped-series with both", () => {
    expect(resultShape({ granularity: "day", groupBy: ["weapon"] })).toBe(
      "grouped-series"
    );
  });
});

describe("compatibleVisualizations", () => {
  it("limits a scalar to a single number", () => {
    expect(compatibleVisualizations("scalar")).toEqual(["number"]);
  });

  it("never offers number for non-scalar shapes", () => {
    for (const shape of ["series", "groups", "grouped-series"] as const) {
      expect(compatibleVisualizations(shape)).not.toContain("number");
    }
  });
});

describe("defaultVisualization", () => {
  it("uses the first compatible visualization", () => {
    expect(defaultVisualization({ granularity: "none" })).toBe("number");
    expect(defaultVisualization({ granularity: "day" })).toBe("area");
    expect(
      defaultVisualization({ granularity: "none", groupBy: ["map"] })
    ).toBe("table");
  });
});
