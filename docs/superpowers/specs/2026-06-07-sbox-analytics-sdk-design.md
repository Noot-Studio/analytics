# s&box Analytics SDK — Design

**Date:** 2026-06-07
**Component:** `apps/sdk` (standalone git repo, junctioned into the monorepo)
**Status:** Approved design, pre-implementation

## Goal

Implement the game-side SDK so an s&box developer can drop one component into
their game and immediately ship analytics events to the platform's Ingestion
API — both **automatic default events** (session, scene, connect/disconnect) and
**custom events** the developer registers from gameplay code.

## Decisions (locked)

| #   | Decision          | Choice                                                                                                                                                                   |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Public API shape  | **Drop-in `Component` + static `Analytics` facade.** Config + lifecycle on the component; `Analytics.Track(...)` for custom events anywhere.                             |
| 2   | Default events    | **Full set**, each toggleable, all on by default: `session_start`, `scene_loaded`, `player_connected`, `player_disconnected`, `session_end`.                             |
| 3   | Multiplayer scope | **Host-only for default lifecycle events; custom `Track()` is caller-local.** No duplicate session/scene events across peers. Singleplayer = local host, identical path. |
| 4   | `player_id`       | **Hashed SteamId**: `("sbox-analytics:" + steamId).Md5()` — stable, anonymous, one-way; raw SteamID never sent.                                                          |

## Wire contract (source of truth)

From `apps/ingest/src/schema.ts` + `packages/events/src/contract.ts` — the SDK
serializes to **exactly** this shape, no more:

```
POST {ingestUrl}/v1/events
Header: x-api-key: pk_…
Body: { "events": [ Event, … ] }   // 1–500 events, body ≤ 2 MB
```

Each `Event`:

| Field        | Type              | Required | Notes                           |
| ------------ | ----------------- | -------- | ------------------------------- |
| `type`       | string (1–128)    | yes      | event name                      |
| `session_id` | string (1–128)    | yes      | groups one play session         |
| `player_id`  | string (≤128)     | no       | anonymous hash, default `""`    |
| `properties` | object            | no       | JSON-encoded ≤ 16 KB per event  |
| `timestamp`  | ISO 8601 string   | no       | defaults to server receive time |
| `scene`      | string (≤128)     | no       | map/scene name, default `""`    |
| `position`   | `{x,y,z}` numbers | no       | marks event spatial             |

Success → `202 { "accepted": n }`. Errors: `400` invalid/oversized props,
`401` bad key, `413` body too large, `5xx` transient.

## Verified s&box APIs (sandbox-whitelisted)

- **HTTP:** `Sandbox.Http.RequestAsync(url, method, HttpContent, Dictionary<string,string> headers, CancellationToken)` → `Task<HttpResponseMessage>`.
- **Lifecycle:** `Component.OnStart`, `OnEnabled`, `OnUpdate`, `OnDisabled`, `OnDestroy`.
- **Network (host-only):** `Component.INetworkListener` → `OnActive(Connection)` (player fully loaded & in game), `OnDisconnected(Connection)`. `OnConnected` fires before join completes — we use `OnActive` for the "connected & playing" signal.
- **Identity:** `Connection.SteamId` (ulong), `Connection.Local` (local connection), `Connection.DisplayName`.
- **Hashing:** `string.Md5()` extension (`Sandbox.SandboxSystemExtensions.Md5`). `FastHash64` also available.
- **JSON:** `Sandbox.Json.Serialize(obj)`.
- **Scene name:** resolved from the active `Scene` (`Scene.Title` / scene source) — exact accessor confirmed at implementation.

## Architecture

Namespace `Noot.Analytics` (matches NuGet ident `Noot.Analytics.Sdk`). Files in
`apps/sdk/Code/`:

### `AnalyticsEvent.cs`

Plain model for one event: `Type`, `SessionId`, `PlayerId`, `Properties`
(`Dictionary<string, object>`), `Timestamp`, `Scene`, `Position` (`Vector3?`).
Knows how to project itself into the wire JSON object (omitting empty optional
fields; `position` only when set). One clear job: in-memory event → wire shape.

### `EventBuffer.cs`

Thread-safe in-memory queue. Responsibilities:

- `Add(AnalyticsEvent)` — enforce per-event `properties` ≤ 16 KB (drop + log if
  over, never crash the game).
- `TakeBatch(max = 500)` — pop up to N events, build the `{ events: [...] }`
  payload object.
- Bounded capacity: if the buffer exceeds a cap (e.g. 10 000) because sends keep
  failing, drop **oldest** events and log — never grow unbounded.
- No network knowledge → unit-testable in isolation.

### `EventSender.cs`

Thin HTTP transport. `Task<bool> SendAsync(payload, apiKey, ingestUrl)` →
`Http.RequestAsync(ingestUrl + "/v1/events", "POST", jsonContent, {"x-api-key": apiKey})`.
Returns success on `202`. On failure: log + return false (caller re-queues).
Kept thin behind an interface so `EventBuffer`/flush logic is testable without a
live network.

### `PlayerId.cs`

`static string Hash(ulong steamId)` → `("sbox-analytics:" + steamId).Md5()`.
`steamId == 0` (no Steam identity) → return `""`. Pure, deterministic, testable.

### `Analytics.cs` — static facade

Developer-facing entry point for **custom** events:

- `Analytics.Track(string type, object properties = null, string scene = null, Vector3? position = null)`
  — tags the event with the caller machine's `session_id` and local `player_id`,
  enqueues on the active client's buffer.
- `Analytics.Flush()` — force an immediate send.
- Holds a reference to the active `AnalyticsComponent` (set on its `OnEnabled`,
  cleared on `OnDisabled`). If no active client, `Track` is a no-op + one-time
  warning (SDK not installed in scene).
- Holds the **process-scoped** `session_id` (GUID, created once, survives scene
  reloads) and the cached local `player_id`.

### `AnalyticsComponent.cs` — drop-in component

`Component`, implements `INetworkListener`. Editor-exposed `[Property]` fields:

| Property               | Default                             | Purpose                              |
| ---------------------- | ----------------------------------- | ------------------------------------ |
| `ApiKey`               | `""`                                | publishable `pk_…` key               |
| `IngestUrl`            | `https://ingest.sbox-analytics.com` | override for self-host/local         |
| `TrackSessions`        | `true`                              | toggle session_start/session_end     |
| `TrackSceneLoads`      | `true`                              | toggle scene_loaded                  |
| `TrackConnections`     | `true`                              | toggle player_connected/disconnected |
| `FlushIntervalSeconds` | `10`                                | periodic flush cadence               |
| `MaxBatchSize`         | `50`                                | events per send (capped at 500)      |

Behavior:

- `OnEnabled` → register as active client in `Analytics`; ensure process
  `session_id` + local `player_id` exist; emit `session_start` **once per
  process** (static guard) if `TrackSessions`.
- `OnStart` → emit `scene_loaded` (with current scene name) if `TrackSceneLoads`.
  `OnStart` fires once after enable, so a scene change (new component instance)
  yields exactly one `scene_loaded`, unlike `OnEnabled` which re-fires on toggle.
- `OnUpdate` → if `RealTimeSince(lastFlush) ≥ FlushIntervalSeconds` or buffer ≥
  `MaxBatchSize`, fire async flush.
- `INetworkListener.OnActive(conn)` → emit `player_connected` with
  `PlayerId.Hash(conn.SteamId)` in properties/player_id (host-only by engine).
- `INetworkListener.OnDisconnected(conn)` → emit `player_disconnected`.
- `OnDisabled` / `OnDestroy` → emit `session_end` (process-scoped, best-effort),
  **force-flush** so buffered events are not lost.

### Default-event → type mapping

| Default event  | `type` sent           | When                                 | Emitter   |
| -------------- | --------------------- | ------------------------------------ | --------- |
| Session begins | `session_start`       | first SDK init in process            | local     |
| Scene loads    | `scene_loaded`        | component `OnStart`, carries `scene` | local     |
| Player joins   | `player_connected`    | `INetworkListener.OnActive`          | host only |
| Player leaves  | `player_disconnected` | `INetworkListener.OnDisconnected`    | host only |
| Session ends   | `session_end`         | teardown / quit                      | local     |

`session_start`, `session_end` map to canonical `CORE_EVENT_TYPES`.
`scene_loaded`, `player_connected`, `player_disconnected` are custom names — the
API accepts arbitrary `type`, and these read cleanly on the dashboard's raw
stream. (`scene_loaded` deliberately distinct from the perf-contract
`load_complete`, which means load _timing_, not a scene change.)

### Editor tooling — `Editor/AnalyticsMenu.cs`

Replaces the `MyEditorMenu` placeholder. One menu item, "s&box Analytics → Add
to scene", that creates a `GameObject` carrying `AnalyticsComponent` so setup is
discoverable. Editor-only; never referenced by runtime code.

## Data flow

```
gameplay code ── Analytics.Track(type, props) ─┐
AnalyticsComponent default events ─────────────┤→ EventBuffer (queue, 16KB guard)
                                                          │ flush (timer / size / teardown)
                                                          ▼
                                                   EventSender ── Http POST /v1/events
                                                          │ 202 ok → done
                                                          │ fail → re-queue (bounded) + log
```

## Error handling

- Missing/empty `ApiKey` → SDK disabled, one-time warning, `Track` no-ops. Never
  throws into game code.
- Send failure → events re-queued (bounded); retried on next flush. No crash.
- Oversized `properties` (>16 KB) → that event dropped + logged; batch continues.
- No active component → `Analytics.Track` no-op + one-time warning.
- All network work is async/fire-and-forget; never blocks the game thread.

## Testing (`UnitTests/`, MSTest)

- `EventBuffer`: add/take round-trip; batch boundary at 500; flush empties;
  > 16 KB properties dropped; bounded-capacity drops oldest.
- `AnalyticsEvent`: serialized JSON keys exactly match the wire contract
  (`type`, `session_id`, `player_id`, `properties`, `timestamp`, `scene`,
  `position`); optional empties omitted; `position` only when set.
- `PlayerId.Hash`: deterministic for same input; differs from raw SteamId;
  `0 → ""`.
- HTTP not unit-tested (sender kept thin behind an interface; buffer/flush tested
  with a fake sender).

## Documentation updates

1. `apps/sdk/CLAUDE.md` + `apps/sdk/AGENTS.md` — replace the "fresh template"
   note with the real API: file map, drop-in usage, default events, `Track`,
   config fields, `player_id` privacy model.
2. `apps/fumadocs/content/docs/` — new **SDK** page (install, drop-in component,
   default events table, custom events, config, host-only/privacy notes). Wire
   into `meta.json` nav and link from `index.mdx`. Match existing MDX style
   (frontmatter `title`/`description`/`icon`, tables, `Callout`/`Cards`, fenced
   code).

## Known constraints / non-goals

- **Session boundaries are process-scoped, best-effort.** s&box has no reliable
  app-quit hook distinct from scene-unload; `session_id` is held statically so
  it survives scene reloads, and `session_end` is emitted on teardown with a
  forced flush. We do not attempt perfect quit detection in v1.
- **Host-only defaults** mean a non-hosting client's session lifecycle is
  represented by the host's `player_connected`/`player_disconnected` events, not
  its own `session_start`. This is intentional (avoids duplicates).
- No offline persistence/disk spooling, no client→host RPC forwarding of custom
  events, no sampling/rate-limiting beyond the buffer cap — all out of scope for
  v1 (YAGNI).
