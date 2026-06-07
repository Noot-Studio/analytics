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

| #   | Decision          | Choice                                                                                                                                                                                                                                                                                       |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Public API shape  | **Standalone static `Analytics` core, usable with no component** (`Init`/`Track`/`Flush`/`Shutdown`). `AnalyticsComponent` is an _optional_ drop-in helper that auto-configures the core and auto-tracks scene/network default events. The component depends on the core, never the reverse. |
| 2   | Default events    | **Full set**, each toggleable, all on by default: `session_start`, `scene_loaded`, `player_connected`, `player_disconnected`, `session_end`.                                                                                                                                                 |
| 3   | Multiplayer scope | **Host-only for default lifecycle events; custom `Track()` is caller-local.** No duplicate session/scene events across peers. Singleplayer = local host, identical path.                                                                                                                     |
| 4   | `player_id`       | **Hashed SteamId**: `("sbox-analytics:" + steamId).Md5()` — stable, anonymous, one-way; raw SteamID never sent.                                                                                                                                                                              |

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
- **Background timer (no component):** `Sandbox.GameTask.DelayRealtimeSeconds(float, CancellationToken)` — lets the standalone core run its own flush loop without a `Component.OnUpdate`.
- **Attribute-driven tracking:** `Sandbox.CodeGeneratorAttribute(CodeGeneratorFlags, callbackName, priority)` wraps methods/property-setters at compile time (works cross-assembly on game code that references the SDK, same as engine `[Rpc]`). Callbacks receive `WrappedMethod m, params object[] args` (method) or `WrappedPropertySet<T> p` (setter); both expose `GetAttribute<T>()`, the member name, and `Resume()` / `Setter(value)` to run the original. `WrappedPropertySet<T>` also gives `Value` + `Getter()`.
- **Scene name:** resolved from the active `Scene` (`Scene.Title` / scene source) — exact accessor confirmed at implementation.

## Architecture

Namespace `Noot.Analytics` (matches NuGet ident `Noot.Analytics.Sdk`). Files in
`apps/sdk/Code/`.

**One core + two optional sugar layers; dependencies point inward only.**

- **Core** (`Analytics`, `AnalyticsClient`, `AnalyticsOptions`, `AnalyticsEvent`,
  `EventBuffer`, `EventSender`, `PlayerId`) — the entire SDK. Configured and used
  from code with **no component**. Owns session, identity, buffering, sending,
  and its own flush loop.
- **Component helper** (`AnalyticsComponent`) — _optional_ drop-in that
  auto-configures the core and auto-tracks the default events that need
  scene/network presence.
- **Attribute helper** (`TrackAttribute`) — _optional_ declarative `[Track]` on a
  method or property; pure sugar that calls `Analytics.Track`.

Both helpers call into the core; the core references neither.

**Three ways to register a custom event, all funnel into `Analytics.Track`:**

```csharp
[Track( "wave_cleared" )] void ClearWave() { … }      // 1. declarative attribute
Analytics.Track( "wave_cleared", new { wave } );       // 2. imperative (full control)
// 3. component auto-emits the default lifecycle events for you
```

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

### `AnalyticsOptions.cs`

Config passed to `Analytics.Init`. Plain record with defaults:

| Field                  | Default                             | Purpose                             |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| `IngestUrl`            | `https://ingest.sbox-analytics.com` | override for self-host/local        |
| `TrackSessions`        | `true`                              | auto session_start / session_end    |
| `FlushIntervalSeconds` | `10`                                | background flush cadence            |
| `MaxBatchSize`         | `50`                                | events per send (capped at 500)     |
| `PlayerId`             | `null`                              | override; else hashed local SteamId |

(`TrackSceneLoads` / `TrackConnections` are component concerns — scene/network
events only exist with the component — so they live on `AnalyticsComponent`, not
here.)

### `Analytics.cs` — static facade (entry point)

Thin static surface over a single `AnalyticsClient` instance. **This is the whole
SDK from a developer's view; no component required.**

- `Analytics.Init(string apiKey, AnalyticsOptions options = null)` — create the
  client, generate the process `session_id`, resolve local `player_id`
  (`PlayerId.Hash(Connection.Local?.SteamId ?? 0)` unless overridden), start the
  background flush loop, emit `session_start` if `TrackSessions`. Idempotent: a
  second call while initialized is a no-op + warning.
- `Analytics.Track(string type, object properties = null, string scene = null, Vector3? position = null)`
  — build an `AnalyticsEvent` tagged with `session_id` + `player_id`, enqueue.
  Before `Init`: no-op + one-time warning (never throws).
- `Analytics.Flush()` — force an immediate send.
- `Analytics.Shutdown()` — emit `session_end`, final flush, cancel the loop, clear
  the client.
- `Analytics.IsInitialized` — lets the helper component avoid double-init.

`Track` accepts an explicit `playerId` overload too, so server-authoritative code
can attribute an event to a specific (already-hashed) player.

### `AnalyticsClient.cs` — core instance

Owns everything stateful: `AnalyticsOptions`, the process-scoped `session_id`
(GUID, created once, survives scene reloads), cached local `player_id`,
`EventBuffer`, `EventSender`, and the flush loop:

```
async loop while !cancelled:
    await GameTask.DelayRealtimeSeconds( FlushIntervalSeconds, ct )
    if buffer not empty → send a batch
```

Size-triggered flush: when `EventBuffer` reaches `MaxBatchSize`, kick an
immediate send instead of waiting for the timer. Single owner of send semantics
(re-queue on failure, bounded capacity).

### `TrackAttribute.cs` — declarative `[Track]` (optional sugar)

A `[CodeGenerator]`-backed attribute that emits an event whenever a decorated
**method is called** or **property is set**. Pure sugar over `Analytics.Track` —
adds no state, works only once the core is initialized (otherwise `Track`
no-ops).

```csharp
[AttributeUsage( AttributeTargets.Method | AttributeTargets.Property )]
[CodeGenerator( CodeGeneratorFlags.WrapMethod      | CodeGeneratorFlags.Instance | CodeGeneratorFlags.Static, "Noot.Analytics.TrackAttribute.OnInvoked" )]
[CodeGenerator( CodeGeneratorFlags.WrapPropertySet | CodeGeneratorFlags.Instance | CodeGeneratorFlags.Static, "Noot.Analytics.TrackAttribute.OnSet" )]
public sealed class TrackAttribute : Attribute
{
    public string Name { get; }
    public bool Params { get; set; }            // opt-in: capture method args as properties

    public TrackAttribute( string name = null ) => Name = name;

    public static void OnInvoked( WrappedMethod m, params object[] args )
    {
        m.Resume();                                          // run the real method first
        var attr = m.GetAttribute<TrackAttribute>();
        var type = string.IsNullOrEmpty( attr.Name ) ? m.MethodName : attr.Name;
        var props = attr.Params ? CaptureArgs( m, args ) : null;
        Analytics.Track( type, props );
    }

    public static void OnSet<T>( WrappedPropertySet<T> p )
    {
        var changed = !EqualityComparer<T>.Default.Equals( p.Getter(), p.Value );
        p.Setter( p.Value );                                 // apply the real set
        if ( !changed ) return;                              // emit on actual change only
        var attr = p.GetAttribute<TrackAttribute>();
        var type = string.IsNullOrEmpty( attr.Name ) ? p.PropertyName : attr.Name;
        Analytics.Track( type, new Dictionary<string, object> { ["value"] = p.Value } );
    }
}
```

Behavior:

- **Method, default** (`[Track("evt")]`) → emits `evt` (or the method name if
  `Name` omitted), **no properties**.
- **Method, `Params = true`** → also captures arguments as properties. Param
  _names_ are resolved once per method via `TypeLibrary` (`MethodDescription.Parameters`
  matched by `WrappedMethod.MethodIdentity`, cached); falls back to `arg0/arg1…`
  if names can't be resolved. Non-serializable args are skipped.
- **Property setter** (`[Track("evt")]` on a property) → emits on **actual value
  change** with `properties = { "value": newValue }`. The new value is free here
  (`WrappedPropertySet.Value`), so it is always included — `Params` is a no-op for
  setters.

Usage:

```csharp
[Track( "player_jumped" )]                void Jump() { … }                       // { type }
[Track( "player_jumped", Params = true )] void Jump( float h, string surf ) { … } // { type, properties:{ h, surf } }
[Track( "score_changed" )]                public int Score { get; set; }          // emits { value } on change
```

### `AnalyticsComponent.cs` — optional drop-in helper

`Component`, implements `INetworkListener`. Auto-tracks the default events that
require a scene/network presence. Editor-exposed `[Property]` fields:

| Property               | Default                             | Purpose                            |
| ---------------------- | ----------------------------------- | ---------------------------------- |
| `ApiKey`               | `""`                                | publishable `pk_…` key             |
| `IngestUrl`            | `https://ingest.sbox-analytics.com` | override for self-host/local       |
| `TrackSessions`        | `true`                              | maps to `AnalyticsOptions`         |
| `TrackSceneLoads`      | `true`                              | emit scene_loaded                  |
| `TrackConnections`     | `true`                              | emit player_connected/disconnected |
| `FlushIntervalSeconds` | `10`                                | maps to `AnalyticsOptions`         |
| `MaxBatchSize`         | `50`                                | maps to `AnalyticsOptions`         |

Behavior:

- `OnEnabled` → if `!Analytics.IsInitialized`, call `Analytics.Init(ApiKey, …)`
  built from the editor fields, and remember it was the initializer
  (`_ownsClient = true`). If the core was already inited from code, just attach —
  do not re-init.
- `OnStart` → emit `scene_loaded` (with current scene name) if `TrackSceneLoads`.
  `OnStart` fires once after enable, so a scene change (new component instance)
  yields exactly one `scene_loaded`, unlike `OnEnabled` which re-fires on toggle.
- `INetworkListener.OnActive(conn)` → if `TrackConnections`, emit
  `player_connected` with `playerId = PlayerId.Hash(conn.SteamId)` (host-only by
  engine).
- `INetworkListener.OnDisconnected(conn)` → if `TrackConnections`, emit
  `player_disconnected` likewise.
- `OnDestroy` → if `_ownsClient`, `Analytics.Shutdown()` (emits session_end +
  final flush). If the core was code-owned, leave it running — the component only
  tears down what it started.

Periodic flushing is driven by the **core's** loop, not the component — so it
keeps working when no component is present.

### Default-event → type mapping

| Default event  | `type` sent           | When                                 | Source    | Emitter   |
| -------------- | --------------------- | ------------------------------------ | --------- | --------- |
| Session begins | `session_start`       | `Analytics.Init`                     | core      | local     |
| Scene loads    | `scene_loaded`        | component `OnStart`, carries `scene` | component | local     |
| Player joins   | `player_connected`    | `INetworkListener.OnActive`          | component | host only |
| Player leaves  | `player_disconnected` | `INetworkListener.OnDisconnected`    | component | host only |
| Session ends   | `session_end`         | `Analytics.Shutdown`                 | core      | local     |

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
[Track] method/property  ── Analytics.Track ───┐
gameplay code            ── Analytics.Track ───┤→ AnalyticsClient
AnalyticsComponent default events ─────────────┤    └─ EventBuffer (queue, 16KB guard)
(scene_loaded, player_connected/disconnected)   │         │ flush (core loop / size / Shutdown)
                                                 │         ▼
                                                 │   EventSender ── Http POST /v1/events
                                                 │         │ 202 ok → done
                                                 │         │ fail → re-queue (bounded) + log
core (Init/session_start, Shutdown/session_end)─┘
```

## Error handling

- `Track` / `Flush` before `Analytics.Init` → no-op + one-time warning. Never
  throws into game code. (Component auto-inits, so component users never hit this.)
- Missing/empty `ApiKey` at `Init` → core stays disabled, one-time warning,
  `Track` no-ops.
- Send failure → events re-queued (bounded); retried on next flush. No crash.
- Oversized `properties` (>16 KB) → that event dropped + logged; batch continues.
- All network work is async/fire-and-forget; never blocks the game thread.

## Testing (`UnitTests/`, MSTest)

- `EventBuffer`: add/take round-trip; batch boundary at 500; flush empties;
  > 16 KB properties dropped; bounded-capacity drops oldest.
- `AnalyticsEvent`: serialized JSON keys exactly match the wire contract
  (`type`, `session_id`, `player_id`, `properties`, `timestamp`, `scene`,
  `position`); optional empties omitted; `position` only when set.
- `PlayerId.Hash`: deterministic for same input; differs from raw SteamId;
  `0 → ""`.
- `Analytics` core lifecycle **with no component**: `Init` emits `session_start`
  and enqueues; `Track` before `Init` no-ops; `Shutdown` emits `session_end` +
  flushes. Verifies the SDK is fully usable standalone (uses a fake sender).
- `TrackAttribute` arg-name resolution helper (`CaptureArgs`): tested directly by
  passing a known `MethodIdentity` and arg array (names mapped, `arg{i}` fallback,
  non-serializable skipped). The codegen _wrapping_ itself isn't unit-testable —
  it only runs in the s&box runtime, and `WrappedMethod`/`WrappedPropertySet` are
  engine structs we can't fabricate in MSTest — so the attribute is a thin shim
  over the already-tested `Analytics.Track` path.
- HTTP not unit-tested (sender kept thin behind an interface; buffer/flush tested
  with a fake sender).

## Documentation updates

1. `apps/sdk/CLAUDE.md` + `apps/sdk/AGENTS.md` — replace the "fresh template"
   note with the real API: file map, drop-in usage, default events, `Track`,
   config fields, `player_id` privacy model.
2. `apps/fumadocs/content/docs/` — new **SDK** page covering **all three event
   APIs**: (a) drop-in component (zero code), (b) `[Track]` attribute on
   methods/properties (incl. `Params = true`), (c) standalone
   `Analytics.Init`/`Track` from code. Plus default events table, config,
   host-only/privacy notes. Wire into `meta.json` nav and link from `index.mdx`.
   Match existing MDX style (frontmatter `title`/`description`/`icon`, tables,
   `Callout`/`Cards`, fenced code).

## Known constraints / non-goals

- **Session boundaries are process-scoped, best-effort.** s&box has no reliable
  app-quit hook distinct from scene-unload; `session_id` is held statically so it
  survives scene reloads. `session_end` is emitted from `Analytics.Shutdown` —
  called automatically by the component it owns on `OnDestroy`, or manually by
  code-only users. We do not attempt perfect quit detection in v1.
- **Host-only defaults** mean a non-hosting client's session lifecycle is
  represented by the host's `player_connected`/`player_disconnected` events, not
  its own `session_start`. This is intentional (avoids duplicates).
- **`[Track]` is compile-time codegen.** It only wraps members in assemblies s&box
  recompiles (game/addon code referencing the SDK) — same model as engine
  `[Rpc]`. Don't put it on hot per-frame methods (per-call indirection + event
  spam). Property-setter tracking emits on _change_, not every assignment.
- No offline persistence/disk spooling, no client→host RPC forwarding of custom
  events, no sampling/rate-limiting beyond the buffer cap — all out of scope for
  v1 (YAGNI).
