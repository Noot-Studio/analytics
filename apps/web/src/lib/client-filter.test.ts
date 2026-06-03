import { describe, expect, it } from "bun:test";

import type { ExtendedColumnFilter } from "@/types/data-table";

import { filterRows } from "./client-filter";

interface Row {
  event: string;
  score: number;
}

const rows: Row[] = [
  { event: "player_join", score: 10 },
  { event: "player_leave", score: 20 },
  { event: "map_load", score: 30 },
];

const filter = (
  over: Partial<ExtendedColumnFilter<Row>>
): ExtendedColumnFilter<Row> => ({
  filterId: "f1",
  id: "event",
  operator: "iLike",
  value: "",
  variant: "text",
  ...over,
});

const events = (result: Row[]) => result.map((row) => row.event);

describe("filterRows", () => {
  it("returns every row when no filter has a usable value", () => {
    expect(filterRows(rows, [], "and")).toHaveLength(3);
    expect(filterRows(rows, [filter({ value: "" })], "and")).toHaveLength(3);
  });

  it("matches contains case-insensitively (iLike)", () => {
    const result = filterRows(rows, [filter({ value: "PLAYER" })], "and");
    expect(events(result)).toEqual(["player_join", "player_leave"]);
  });

  it("excludes matches for notILike", () => {
    const result = filterRows(rows, [filter({ value: "player" })], "and");
    const inverse = filterRows(
      rows,
      [filter({ operator: "notILike", value: "player" })],
      "and"
    );
    expect(events(result)).toHaveLength(2);
    expect(events(inverse)).toEqual(["map_load"]);
  });

  it("compares numbers for numeric variants", () => {
    const gt = filterRows(
      rows,
      [filter({ id: "score", operator: "gt", value: "15", variant: "number" })],
      "and"
    );
    expect(events(gt)).toEqual(["player_leave", "map_load"]);

    const between = filterRows(
      rows,
      [
        filter({
          id: "score",
          operator: "isBetween",
          value: ["15", "25"],
          variant: "range",
        }),
      ],
      "and"
    );
    expect(events(between)).toEqual(["player_leave"]);
  });

  it("combines conditions with AND vs OR", () => {
    const conditions = [
      filter({ filterId: "a", value: "player" }),
      filter({
        filterId: "b",
        id: "score",
        operator: "gt",
        value: "15",
        variant: "number",
      }),
    ];
    expect(events(filterRows(rows, conditions, "and"))).toEqual([
      "player_leave",
    ]);
    expect(events(filterRows(rows, conditions, "or"))).toEqual([
      "player_join",
      "player_leave",
      "map_load",
    ]);
  });
});
