import { describe, expect, it } from "bun:test";

import {
  BUILTIN_CARD_TYPES,
  cardSchema,
  customCardConfigSchema,
  DEFAULT_ORG_OVERVIEW,
  DEFAULT_PROJECT_OVERVIEW,
} from "./dashboard-cards";

const validCustomQuery = {
  aggregation: "count",
  granularity: "none",
  limit: 100,
} as const;

describe("cardSchema", () => {
  it("accepts every built-in card type with an empty config", () => {
    for (const cardType of BUILTIN_CARD_TYPES) {
      const result = cardSchema.safeParse({
        cardType,
        config: {},
        size: "Third",
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a built-in card pinned to a project", () => {
    const result = cardSchema.safeParse({
      cardType: "metric.events",
      config: { projectId: "proj_1" },
      size: "Half",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown card type", () => {
    const result = cardSchema.safeParse({
      cardType: "metric.unknown",
      config: {},
      size: "Full",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid size", () => {
    const result = cardSchema.safeParse({
      cardType: "metric.events",
      config: {},
      size: "Quarter",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid custom metric card", () => {
    const result = cardSchema.safeParse({
      cardType: "custom.stat",
      config: {
        display: "metric",
        query: validCustomQuery,
        title: "Kills",
      },
      size: "Third",
    });
    expect(result.success).toBe(true);
  });
});

describe("customCardConfigSchema", () => {
  it("strips projectId and timeRange from the stored query", () => {
    const result = customCardConfigSchema.safeParse({
      display: "metric",
      query: {
        ...validCustomQuery,
        projectId: "proj_1",
        timeRange: { from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" },
      },
      title: "Kills",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).not.toHaveProperty("projectId");
      expect(result.data.query).not.toHaveProperty("timeRange");
    }
  });

  it("rejects metric display with a time granularity", () => {
    const result = customCardConfigSchema.safeParse({
      display: "metric",
      query: { ...validCustomQuery, granularity: "day" },
      title: "Kills",
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeseries display without a time granularity", () => {
    const result = customCardConfigSchema.safeParse({
      display: "timeseries",
      query: { ...validCustomQuery, granularity: "none" },
      title: "Kills over time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = customCardConfigSchema.safeParse({
      display: "metric",
      query: validCustomQuery,
      title: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("default layouts", () => {
  it("every default card validates against cardSchema", () => {
    for (const card of [...DEFAULT_PROJECT_OVERVIEW, ...DEFAULT_ORG_OVERVIEW]) {
      const result = cardSchema.safeParse({
        cardType: card.cardType,
        config: card.config,
        id: card.id,
        size: card.size,
      });
      expect(result.success).toBe(true);
    }
  });

  it("default cards have contiguous positions starting at 0", () => {
    const positions = DEFAULT_PROJECT_OVERVIEW.map((card) => card.position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });
});
