import { describe, expect, it } from "bun:test";

import {
  buildSessionEventsCountQuery,
  buildSessionEventsQuery,
} from "./session-events";
import type { SessionEventsInput } from "./session-events";

const base: SessionEventsInput = {
  joinOperator: "and",
  page: 1,
  perPage: 20,
  projectId: "proj_1",
  sessionId: "session_1",
  sortDesc: false,
};

describe("buildSessionEventsQuery", () => {
  it("scopes to the session, paginates, default sort timestamp ASC", () => {
    const { query, params } = buildSessionEventsQuery(base);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain(
      "WHERE project_id = {projectId:String} AND session_id = {sessionId:String}"
    );
    expect(query).toContain("ORDER BY timestamp ASC");
    expect(query).toContain("LIMIT {perPage:UInt32} OFFSET {offset:UInt32}");
    expect(params).toMatchObject({
      offset: 0,
      perPage: 20,
      projectId: "proj_1",
      sessionId: "session_1",
    });
  });

  it("maps page -> offset and honours an allowed sortBy + descending", () => {
    const { query, params } = buildSessionEventsQuery({
      ...base,
      page: 3,
      sortBy: "event_type",
      sortDesc: true,
    });
    expect(query).toContain("ORDER BY event_type DESC");
    expect(params.offset).toBe(40);
  });

  it("falls back to timestamp for a disallowed sort column", () => {
    const { query } = buildSessionEventsQuery({
      ...base,
      sortBy: "properties",
    });
    expect(query).toContain("ORDER BY timestamp ASC");
  });

  it("appends advanced filters to the WHERE clause", () => {
    const { query, params } = buildSessionEventsQuery({
      ...base,
      filters: [{ operator: "eq", property: "event_type", value: "crash" }],
    });
    expect(query).toContain("event_type = {filter_0_value:String}");
    expect(params.filter_0_value).toBe("crash");
  });
});

describe("buildSessionEventsCountQuery", () => {
  it("counts matching events without pagination params", () => {
    const { query, params } = buildSessionEventsCountQuery(base);
    expect(query).toContain("SELECT count() AS total");
    expect(query).toContain(
      "WHERE project_id = {projectId:String} AND session_id = {sessionId:String}"
    );
    expect(params).not.toHaveProperty("offset");
    expect(params).not.toHaveProperty("perPage");
  });

  it("mirrors the same filters so the total matches the page", () => {
    const { query, params } = buildSessionEventsCountQuery({
      ...base,
      filters: [{ operator: "eq", property: "event_type", value: "crash" }],
    });
    expect(query).toContain("event_type = {filter_0_value:String}");
    expect(params.filter_0_value).toBe("crash");
  });
});
