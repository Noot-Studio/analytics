# s&box Analytics SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the game-side s&box Analytics SDK in `apps/sdk` — a standalone core (`Analytics.Init/Track/Flush/Shutdown`) plus two optional sugar layers (`AnalyticsComponent`, `[Track]` attribute) — that batches gameplay events to `POST /v1/events`, then document it.

**Architecture:** One core owns session id, anonymous player id, an in-memory buffer, an HTTP sender, and a self-driven flush loop. The core works with zero components. `AnalyticsComponent` is an optional drop-in that auto-configures the core and emits scene/network default events; `[Track]` is compile-time codegen sugar over `Analytics.Track`. Dependencies point inward only (helpers → core).

**Tech Stack:** C# (LangVersion 14, net10.0), s&box whitelisted APIs (`Http`, `GameTask`, `Json`, `Connection`, `Component.INetworkListener`, `[CodeGenerator]`), MSTest (`dotnet test`).

**Source spec:** `docs/superpowers/specs/2026-06-07-sbox-analytics-sdk-design.md`

---

## File Structure

All runtime files live in `apps/sdk/Code/` (namespace `Noot.Analytics`). The `Microsoft.NET.Sdk.Razor` csproj auto-globs `*.cs`, so **no csproj edits are needed** when adding files.

| File                         | Responsibility                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Code/AnalyticsEvent.cs`     | Immutable event model + `ToPayload()` → wire dictionary (snake_case keys).                                                                                   |
| `Code/AnonymousId.cs`        | `Hash(ulong steamId)` → anonymous, stable player id. (Spec called this `PlayerId.cs`; renamed to avoid clashing with the `PlayerId` property on the client.) |
| `Code/EventBuffer.cs`        | Thread-safe queue: add (16 KB guard), take batch, bounded capacity, requeue.                                                                                 |
| `Code/IEventSender.cs`       | Send abstraction (test seam).                                                                                                                                |
| `Code/HttpEventSender.cs`    | Real transport via `Http.RequestAsync`.                                                                                                                      |
| `Code/AnalyticsOptions.cs`   | Config record passed to `Init`.                                                                                                                              |
| `Code/AnalyticsClient.cs`    | Core instance: session/identity, buffer, sender, flush loop, session_start/end.                                                                              |
| `Code/Analytics.cs`          | Static facade: `Init/Track/Flush/Shutdown/IsInitialized` + internal test seam.                                                                               |
| `Code/TrackAttribute.cs`     | `[CodeGenerator]` `[Track]` attribute wrapping methods + property setters.                                                                                   |
| `Code/AnalyticsComponent.cs` | Optional drop-in `Component : INetworkListener`; auto-config + default events.                                                                               |
| `Editor/AnalyticsMenu.cs`    | Replaces `MyEditorMenu`; "Add to scene" helper.                                                                                                              |
| `UnitTests/*.cs`             | MSTest coverage for the pure-logic units.                                                                                                                    |

**Deletions:** `Code/MyLibraryComponent.cs`, `Editor/MyEditorMenu.cs`, `UnitTests/LibraryTest.cs` (placeholder template files).

---

## Pre-flight: confirm these APIs against the live editor (Task 0)

s&box only exposes whitelisted APIs; a wrong accessor fails at compile. Before/while implementing, confirm each below. Fallbacks are listed — if the primary fails to compile, use the fallback and note it.

| Used as              | Primary                                                      | Fallback if not whitelisted                                |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Local player SteamID | `Connection.Local?.SteamId`                                  | `Game.SteamId` (`Sandbox.Game.SteamId`)                    |
| UTC timestamp        | `DateTime.UtcNow`                                            | Omit `timestamp` from payload (server stamps receive time) |
| HTTP body            | `new StringContent(json, Encoding.UTF8, "application/json")` | `new StringContent(json)` then header content-type         |
| Scene name           | `Component.Scene?.Title`                                     | `Scene.GetAllObjects(true)`… → leave `scene` = `""`        |
| New GUID             | `Guid.NewGuid()`                                             | `Game.Random.Int`-built id string                          |

Run command used throughout (PowerShell, from repo root):

```
dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~<ClassName>.<TestName>" --nologo
```

---

### Task 0: Branch + clear placeholders

**Files:**

- Delete: `apps/sdk/Code/MyLibraryComponent.cs`, `apps/sdk/Editor/MyEditorMenu.cs`, `apps/sdk/UnitTests/LibraryTest.cs`

> Note: `apps/sdk` is a **separate git repo** (junctioned). All SDK commits happen inside `apps/sdk`. Docs commits (Tasks 12–13, fumadocs + monorepo) happen in the **monorepo** on branch `feat/analytics-sdk`.

- [ ] **Step 1: Create a branch inside the SDK repo**

```
git -C apps/sdk checkout -b feat/sdk-implementation
```

- [ ] **Step 2: Delete the three placeholder files**

```
git -C apps/sdk rm Code/MyLibraryComponent.cs Editor/MyEditorMenu.cs UnitTests/LibraryTest.cs
```

- [ ] **Step 3: Commit**

```
git -C apps/sdk commit -m "chore: remove library template placeholders"
```

---

### Task 1: `AnalyticsEvent` + wire payload

**Files:**

- Create: `apps/sdk/Code/AnalyticsEvent.cs`
- Test: `apps/sdk/UnitTests/AnalyticsEventTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// apps/sdk/UnitTests/AnalyticsEventTests.cs
using System;
using System.Collections.Generic;
using Noot.Analytics;
using Sandbox;

[TestClass]
public class AnalyticsEventTests
{
    [TestMethod]
    public void ToPayload_RequiredKeys_AlwaysPresent()
    {
        var ev = new AnalyticsEvent
        {
            Type = "level_complete",
            SessionId = "sess_1",
            Timestamp = new DateTime( 2026, 5, 6, 12, 0, 0, DateTimeKind.Utc ),
        };

        var p = ev.ToPayload();

        Assert.AreEqual( "level_complete", p["type"] );
        Assert.AreEqual( "sess_1", p["session_id"] );
        Assert.IsTrue( p.ContainsKey( "timestamp" ) );
    }

    [TestMethod]
    public void ToPayload_EmptyOptionals_Omitted()
    {
        var ev = new AnalyticsEvent { Type = "t", SessionId = "s", Timestamp = DateTime.UtcNow };
        var p = ev.ToPayload();

        Assert.IsFalse( p.ContainsKey( "player_id" ) );
        Assert.IsFalse( p.ContainsKey( "scene" ) );
        Assert.IsFalse( p.ContainsKey( "properties" ) );
        Assert.IsFalse( p.ContainsKey( "position" ) );
    }

    [TestMethod]
    public void ToPayload_SetOptionals_Included()
    {
        var ev = new AnalyticsEvent
        {
            Type = "t",
            SessionId = "s",
            PlayerId = "anon123",
            Scene = "de_dust2",
            Properties = new Dictionary<string, object> { ["k"] = 1 },
            Position = new Vector3( 1f, 2f, 3f ),
            Timestamp = DateTime.UtcNow,
        };

        var p = ev.ToPayload();

        Assert.AreEqual( "anon123", p["player_id"] );
        Assert.AreEqual( "de_dust2", p["scene"] );
        Assert.IsTrue( p.ContainsKey( "properties" ) );
        var pos = (Dictionary<string, object>)p["position"];
        Assert.AreEqual( 1f, pos["x"] );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsEventTests" --nologo`
Expected: FAIL — `AnalyticsEvent` does not exist (compile error).

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/AnalyticsEvent.cs
using System;
using System.Collections.Generic;
using Sandbox;

namespace Noot.Analytics;

/// <summary>One analytics event. Immutable; <see cref="ToPayload"/> produces the wire shape.</summary>
public sealed class AnalyticsEvent
{
	public required string Type { get; init; }
	public required string SessionId { get; init; }
	public string PlayerId { get; init; } = "";
	public object? Properties { get; init; }
	public DateTime Timestamp { get; init; }
	public string Scene { get; init; } = "";
	public Vector3? Position { get; init; }

	/// <summary>
	/// Build the exact wire object. Keys are literal snake_case strings, so JSON
	/// serialization can never drift from the ingest contract. Empty optionals omitted.
	/// </summary>
	public Dictionary<string, object> ToPayload()
	{
		var p = new Dictionary<string, object>
		{
			["type"] = Type,
			["session_id"] = SessionId,
			["timestamp"] = Timestamp.ToUniversalTime().ToString( "o" ),
		};

		if ( !string.IsNullOrEmpty( PlayerId ) )
			p["player_id"] = PlayerId;

		if ( Properties is not null )
			p["properties"] = Properties;

		if ( !string.IsNullOrEmpty( Scene ) )
			p["scene"] = Scene;

		if ( Position is { } pos )
			p["position"] = new Dictionary<string, object> { ["x"] = pos.x, ["y"] = pos.y, ["z"] = pos.z };

		return p;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsEventTests" --nologo`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/AnalyticsEvent.cs UnitTests/AnalyticsEventTests.cs
git -C apps/sdk commit -m "feat: AnalyticsEvent wire payload model"
```

---

### Task 2: `AnonymousId.Hash`

**Files:**

- Create: `apps/sdk/Code/AnonymousId.cs`
- Test: `apps/sdk/UnitTests/AnonymousIdTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// apps/sdk/UnitTests/AnonymousIdTests.cs
using Noot.Analytics;

[TestClass]
public class AnonymousIdTests
{
    [TestMethod]
    public void Hash_Deterministic()
    {
        Assert.AreEqual( AnonymousId.Hash( 76561198000000000 ), AnonymousId.Hash( 76561198000000000 ) );
    }

    [TestMethod]
    public void Hash_NotRawSteamId()
    {
        var raw = "76561198000000000";
        Assert.AreNotEqual( raw, AnonymousId.Hash( 76561198000000000 ) );
    }

    [TestMethod]
    public void Hash_Zero_ReturnsEmpty()
    {
        Assert.AreEqual( "", AnonymousId.Hash( 0 ) );
    }

    [TestMethod]
    public void Hash_DifferentInputs_DifferentOutputs()
    {
        Assert.AreNotEqual( AnonymousId.Hash( 1 ), AnonymousId.Hash( 2 ) );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnonymousIdTests" --nologo`
Expected: FAIL — `AnonymousId` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/AnonymousId.cs
using Sandbox;

namespace Noot.Analytics;

/// <summary>
/// Turns a SteamID into a stable, anonymous, one-way player id. The raw SteamID
/// (PII) is never sent. Uses s&box's whitelisted <c>string.Md5()</c> extension.
/// </summary>
public static class AnonymousId
{
	const string Salt = "sbox-analytics:";

	public static string Hash( ulong steamId )
	{
		if ( steamId == 0 )
			return "";

		return (Salt + steamId).Md5();
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnonymousIdTests" --nologo`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/AnonymousId.cs UnitTests/AnonymousIdTests.cs
git -C apps/sdk commit -m "feat: anonymous player id hashing"
```

---

### Task 3: `EventBuffer`

**Files:**

- Create: `apps/sdk/Code/EventBuffer.cs`
- Test: `apps/sdk/UnitTests/EventBufferTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// apps/sdk/UnitTests/EventBufferTests.cs
using System;
using System.Collections.Generic;
using Noot.Analytics;

[TestClass]
public class EventBufferTests
{
    static AnalyticsEvent Ev( string type = "t", object props = null ) =>
        new() { Type = type, SessionId = "s", Timestamp = DateTime.UtcNow, Properties = props };

    [TestMethod]
    public void AddThenTake_RoundTrips()
    {
        var b = new EventBuffer();
        Assert.IsTrue( b.Add( Ev() ) );
        Assert.AreEqual( 1, b.Count );

        var batch = b.TakeBatch();
        Assert.AreEqual( 1, batch.Count );
        Assert.AreEqual( 0, b.Count );
    }

    [TestMethod]
    public void TakeBatch_RespectsMax()
    {
        var b = new EventBuffer();
        for ( var i = 0; i < 10; i++ )
            b.Add( Ev() );

        var batch = b.TakeBatch( 4 );
        Assert.AreEqual( 4, batch.Count );
        Assert.AreEqual( 6, b.Count );
    }

    [TestMethod]
    public void Add_OversizedProperties_Rejected()
    {
        var b = new EventBuffer();
        var big = new string( 'x', 20 * 1024 );
        Assert.IsFalse( b.Add( Ev( props: new Dictionary<string, object> { ["blob"] = big } ) ) );
        Assert.AreEqual( 0, b.Count );
    }

    [TestMethod]
    public void Add_OverCapacity_DropsOldest()
    {
        var b = new EventBuffer( capacity: 3 );
        for ( var i = 0; i < 5; i++ )
            b.Add( Ev( type: i.ToString() ) );

        Assert.AreEqual( 3, b.Count );
        var batch = b.TakeBatch();
        // oldest two (0,1) dropped; remaining are 2,3,4
        Assert.AreEqual( "2", batch[0].Type );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~EventBufferTests" --nologo`
Expected: FAIL — `EventBuffer` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/EventBuffer.cs
using System;
using System.Collections.Generic;
using System.Text;
using Sandbox;

namespace Noot.Analytics;

/// <summary>Thread-safe FIFO of pending events. Guards property size, caps capacity.</summary>
public sealed class EventBuffer
{
	/// <summary>Hard ingest cap: never more than this many events per request.</summary>
	public const int MaxBatchSize = 500;

	/// <summary>Per-event properties byte cap enforced by the ingest API.</summary>
	public const int MaxPropertiesBytes = 16 * 1024;

	readonly int _capacity;
	readonly Queue<AnalyticsEvent> _queue = new();
	readonly object _lock = new();

	public EventBuffer( int capacity = 10_000 ) => _capacity = capacity;

	public int Count
	{
		get
		{
			lock ( _lock )
				return _queue.Count;
		}
	}

	/// <summary>Enqueue. Returns false (and logs) if properties exceed the 16 KB cap.</summary>
	public bool Add( AnalyticsEvent ev )
	{
		if ( ev.Properties is not null )
		{
			var bytes = Encoding.UTF8.GetByteCount( Json.Serialize( ev.Properties ) );
			if ( bytes > MaxPropertiesBytes )
			{
				Log.Warning( $"[Analytics] dropped '{ev.Type}': properties {bytes} bytes > {MaxPropertiesBytes}" );
				return false;
			}
		}

		lock ( _lock )
		{
			_queue.Enqueue( ev );
			while ( _queue.Count > _capacity )
				_queue.Dequeue();
		}

		return true;
	}

	/// <summary>Pop up to <paramref name="max"/> events (clamped to <see cref="MaxBatchSize"/>).</summary>
	public List<AnalyticsEvent> TakeBatch( int max = MaxBatchSize )
	{
		max = Math.Min( max, MaxBatchSize );
		lock ( _lock )
		{
			var n = Math.Min( max, _queue.Count );
			var list = new List<AnalyticsEvent>( n );
			for ( var i = 0; i < n; i++ )
				list.Add( _queue.Dequeue() );
			return list;
		}
	}

	/// <summary>Return a failed batch to the buffer (best-effort ordering).</summary>
	public void Requeue( IEnumerable<AnalyticsEvent> events )
	{
		lock ( _lock )
		{
			foreach ( var ev in events )
			{
				_queue.Enqueue( ev );
				while ( _queue.Count > _capacity )
					_queue.Dequeue();
			}
		}
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~EventBufferTests" --nologo`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/EventBuffer.cs UnitTests/EventBufferTests.cs
git -C apps/sdk commit -m "feat: bounded thread-safe event buffer"
```

---

### Task 4: `IEventSender` + `HttpEventSender`

**Files:**

- Create: `apps/sdk/Code/IEventSender.cs`
- Create: `apps/sdk/Code/HttpEventSender.cs`

No unit test — this is the thin network boundary (mocked in later tasks). Verified manually against a running ingest service.

- [ ] **Step 1: Write the interface**

```csharp
// apps/sdk/Code/IEventSender.cs
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Noot.Analytics;

/// <summary>Sends a batch to the ingestion API. Abstracted so the core is testable.</summary>
public interface IEventSender
{
	/// <summary>Returns true if the batch was accepted (HTTP 202).</summary>
	Task<bool> SendAsync( List<AnalyticsEvent> batch, string apiKey, string ingestUrl );
}
```

- [ ] **Step 2: Write the HTTP implementation**

```csharp
// apps/sdk/Code/HttpEventSender.cs
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Sandbox;

namespace Noot.Analytics;

/// <summary>Real transport: POST {ingestUrl}/v1/events with the x-api-key header.</summary>
public sealed class HttpEventSender : IEventSender
{
	public async Task<bool> SendAsync( List<AnalyticsEvent> batch, string apiKey, string ingestUrl )
	{
		var events = new List<Dictionary<string, object>>( batch.Count );
		foreach ( var ev in batch )
			events.Add( ev.ToPayload() );

		var json = Json.Serialize( new Dictionary<string, object> { ["events"] = events } );
		var content = new StringContent( json, Encoding.UTF8, "application/json" );
		var headers = new Dictionary<string, string> { ["x-api-key"] = apiKey };

		try
		{
			var response = await Http.RequestAsync( $"{ingestUrl}/v1/events", "POST", content, headers );
			return response.StatusCode == HttpStatusCode.Accepted;
		}
		catch ( Exception e )
		{
			Log.Warning( $"[Analytics] send failed: {e.Message}" );
			return false;
		}
	}
}
```

- [ ] **Step 3: Build to confirm it compiles**

Run: `dotnet build "apps/sdk/Code/analytics.csproj" --nologo`
Expected: Build succeeded. (If `StringContent` or `Http.RequestAsync` errors, apply the Task 0 fallbacks.)

- [ ] **Step 4: Commit**

```
git -C apps/sdk add Code/IEventSender.cs Code/HttpEventSender.cs
git -C apps/sdk commit -m "feat: HTTP event sender behind IEventSender seam"
```

---

### Task 5: `AnalyticsOptions`

**Files:**

- Create: `apps/sdk/Code/AnalyticsOptions.cs`

No dedicated test (plain config). Exercised by Task 6.

- [ ] **Step 1: Write the implementation**

```csharp
// apps/sdk/Code/AnalyticsOptions.cs
namespace Noot.Analytics;

/// <summary>Configuration for <see cref="Analytics.Init"/>.</summary>
public sealed class AnalyticsOptions
{
	/// <summary>Ingestion base URL. Override for self-host / local dev.</summary>
	public string IngestUrl { get; set; } = "https://ingest.sbox-analytics.com";

	/// <summary>Emit session_start on Init and session_end on Shutdown.</summary>
	public bool TrackSessions { get; set; } = true;

	/// <summary>Background flush cadence in real seconds.</summary>
	public float FlushIntervalSeconds { get; set; } = 10f;

	/// <summary>Events per send. Clamped to the ingest cap (500).</summary>
	public int MaxBatchSize { get; set; } = 50;

	/// <summary>Override the anonymous player id. Null = hash of the local SteamID.</summary>
	public string? PlayerId { get; set; }
}
```

- [ ] **Step 2: Commit**

```
git -C apps/sdk add Code/AnalyticsOptions.cs
git -C apps/sdk commit -m "feat: AnalyticsOptions config"
```

---

### Task 6: `AnalyticsClient` (core)

**Files:**

- Create: `apps/sdk/Code/AnalyticsClient.cs`
- Test: `apps/sdk/UnitTests/AnalyticsClientTests.cs`

- [ ] **Step 1: Write the failing test (with a fake sender)**

```csharp
// apps/sdk/UnitTests/AnalyticsClientTests.cs
using System.Collections.Generic;
using System.Threading.Tasks;
using Noot.Analytics;

[TestClass]
public class AnalyticsClientTests
{
    sealed class FakeSender : IEventSender
    {
        public List<AnalyticsEvent> Sent { get; } = new();
        public bool NextResult { get; set; } = true;

        public Task<bool> SendAsync( List<AnalyticsEvent> batch, string apiKey, string ingestUrl )
        {
            if ( NextResult )
                Sent.AddRange( batch );
            return Task.FromResult( NextResult );
        }
    }

    static AnalyticsOptions Opts() =>
        new() { TrackSessions = true, MaxBatchSize = 50, PlayerId = "anon", FlushIntervalSeconds = 999f };

    [TestMethod]
    public void Constructor_EmitsSessionStart_WhenTrackSessions()
    {
        var fake = new FakeSender();
        var client = new AnalyticsClient( "pk_test", Opts(), fake );
        client.Start();

        Assert.AreEqual( 1, client.PendingCount );
    }

    [TestMethod]
    public async Task Flush_SendsBufferedEvents()
    {
        var fake = new FakeSender();
        var client = new AnalyticsClient( "pk_test", Opts(), fake );
        client.Start();
        client.Enqueue( "custom_event" );

        await client.FlushAsync();

        Assert.AreEqual( 0, client.PendingCount );
        Assert.IsTrue( fake.Sent.Exists( e => e.Type == "session_start" ) );
        Assert.IsTrue( fake.Sent.Exists( e => e.Type == "custom_event" ) );
    }

    [TestMethod]
    public async Task Flush_OnFailure_Requeues()
    {
        var fake = new FakeSender { NextResult = false };
        var client = new AnalyticsClient( "pk_test", Opts(), fake );
        client.Start();
        var before = client.PendingCount;

        await client.FlushAsync();

        Assert.AreEqual( before, client.PendingCount ); // nothing lost
    }

    [TestMethod]
    public async Task Shutdown_EmitsSessionEndAndFlushes()
    {
        var fake = new FakeSender();
        var client = new AnalyticsClient( "pk_test", Opts(), fake );
        client.Start();

        await client.ShutdownAsync();

        Assert.IsTrue( fake.Sent.Exists( e => e.Type == "session_end" ) );
    }

    [TestMethod]
    public void Disabled_WhenApiKeyEmpty()
    {
        var client = new AnalyticsClient( "", Opts(), new FakeSender() );
        client.Start();
        client.Enqueue( "x" );

        Assert.AreEqual( 0, client.PendingCount );
    }

    [TestMethod]
    public void Enqueue_UsesExplicitPlayerId_WhenGiven()
    {
        var client = new AnalyticsClient( "pk_test", Opts(), new FakeSender() );
        client.Start();
        client.Enqueue( "k", playerId: "other" );

        Assert.AreEqual( "other", client.PeekLast().PlayerId );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsClientTests" --nologo`
Expected: FAIL — `AnalyticsClient` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/AnalyticsClient.cs
using System;
using System.Threading;
using System.Threading.Tasks;
using Sandbox;

namespace Noot.Analytics;

/// <summary>
/// The core SDK instance: owns the session id, anonymous player id, event buffer,
/// sender, and a self-driven flush loop. Usable with no component.
/// </summary>
public sealed class AnalyticsClient
{
	readonly string _apiKey;
	readonly AnalyticsOptions _options;
	readonly IEventSender _sender;
	readonly EventBuffer _buffer = new();
	CancellationTokenSource? _cts;

	public string SessionId { get; }
	public string PlayerId { get; }
	public bool Enabled { get; }
	public int PendingCount => _buffer.Count;

	public AnalyticsClient( string apiKey, AnalyticsOptions options, IEventSender sender )
	{
		_apiKey = apiKey;
		_options = options;
		_sender = sender;
		SessionId = Guid.NewGuid().ToString();
		PlayerId = options.PlayerId ?? AnonymousId.Hash( Connection.Local?.SteamId ?? 0 );
		Enabled = !string.IsNullOrEmpty( apiKey );

		if ( !Enabled )
			Log.Warning( "[Analytics] no API key — SDK disabled, events will be dropped." );
	}

	/// <summary>Emit session_start (if enabled) and begin the flush loop.</summary>
	public void Start()
	{
		if ( !Enabled )
			return;

		_cts = new CancellationTokenSource();
		if ( _options.TrackSessions )
			Enqueue( "session_start" );

		_ = FlushLoop( _cts.Token );
	}

	public void Enqueue( string type, object? properties = null, string? scene = null,
		Vector3? position = null, string? playerId = null )
	{
		if ( !Enabled )
			return;

		var ev = new AnalyticsEvent
		{
			Type = type,
			SessionId = SessionId,
			PlayerId = playerId ?? PlayerId,
			Properties = properties,
			Scene = scene ?? "",
			Position = position,
			Timestamp = DateTime.UtcNow,
		};

		if ( _buffer.Add( ev ) && _buffer.Count >= _options.MaxBatchSize )
			_ = FlushAsync();
	}

	public async Task FlushAsync()
	{
		if ( !Enabled )
			return;

		var batch = _buffer.TakeBatch( _options.MaxBatchSize );
		if ( batch.Count == 0 )
			return;

		var ok = await _sender.SendAsync( batch, _apiKey, _options.IngestUrl );
		if ( !ok )
			_buffer.Requeue( batch );
	}

	/// <summary>Emit session_end, stop the loop, and flush everything that remains.</summary>
	public async Task ShutdownAsync()
	{
		if ( Enabled && _options.TrackSessions )
			Enqueue( "session_end" );

		_cts?.Cancel();
		await FlushAsync();
	}

	async Task FlushLoop( CancellationToken ct )
	{
		while ( !ct.IsCancellationRequested )
		{
			try
			{
				await GameTask.DelayRealtimeSeconds( _options.FlushIntervalSeconds, ct );
			}
			catch ( OperationCanceledException )
			{
				break;
			}

			await FlushAsync();
		}
	}

	// --- test-only inspection helpers ---
	internal AnalyticsEvent PeekLast()
	{
		var batch = _buffer.TakeBatch();
		var last = batch[^1];
		_buffer.Requeue( batch );
		return last;
	}
}
```

> Note: `PeekLast()` is `internal`; expose it to the test assembly with `[assembly: InternalsVisibleTo("analytics.unittest")]`. Add this in Step 3b.

- [ ] **Step 3b: Expose internals to the test assembly**

Create `apps/sdk/Code/AssemblyInfo.cs`:

```csharp
using System.Runtime.CompilerServices;

[assembly: InternalsVisibleTo( "analytics.unittest" )]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsClientTests" --nologo`
Expected: PASS (6 tests).

> If `Connection.Local` or `DateTime.UtcNow` fail to compile, apply the Task 0 fallbacks and re-run.

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/AnalyticsClient.cs Code/AssemblyInfo.cs UnitTests/AnalyticsClientTests.cs
git -C apps/sdk commit -m "feat: AnalyticsClient core (session, buffer, flush loop)"
```

---

### Task 7: `Analytics` static facade

**Files:**

- Create: `apps/sdk/Code/Analytics.cs`
- Test: `apps/sdk/UnitTests/AnalyticsFacadeTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
// apps/sdk/UnitTests/AnalyticsFacadeTests.cs
using System.Collections.Generic;
using System.Threading.Tasks;
using Noot.Analytics;

[TestClass]
public class AnalyticsFacadeTests
{
    sealed class FakeSender : IEventSender
    {
        public List<AnalyticsEvent> Sent { get; } = new();
        public Task<bool> SendAsync( List<AnalyticsEvent> batch, string apiKey, string ingestUrl )
        {
            Sent.AddRange( batch );
            return Task.FromResult( true );
        }
    }

    [TestCleanup]
    public void Cleanup() => Analytics.ResetForTests();

    [TestMethod]
    public void Track_BeforeInit_NoThrow()
    {
        Analytics.ResetForTests();
        Analytics.Track( "noop" ); // must not throw
        Assert.IsFalse( Analytics.IsInitialized );
    }

    [TestMethod]
    public async Task InitThenTrackThenFlush_Sends()
    {
        var fake = new FakeSender();
        Analytics.InitForTests( fake, new AnalyticsOptions { PlayerId = "anon", FlushIntervalSeconds = 999f } );
        Analytics.Track( "custom_event", new { wave = 7 } );

        await Analytics.FlushAsyncForTests();

        Assert.IsTrue( fake.Sent.Exists( e => e.Type == "custom_event" ) );
    }

    [TestMethod]
    public void Init_Twice_SecondIsNoOp()
    {
        Analytics.InitForTests( new FakeSender(), new AnalyticsOptions { PlayerId = "a" } );
        Analytics.InitForTests( new FakeSender(), new AnalyticsOptions { PlayerId = "b" } );
        Assert.IsTrue( Analytics.IsInitialized ); // no crash, still one client
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsFacadeTests" --nologo`
Expected: FAIL — `Analytics` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/Analytics.cs
using System.Threading.Tasks;
using Sandbox;

namespace Noot.Analytics;

/// <summary>
/// Entry point for the s&box Analytics SDK. Initialize once, then track events
/// from anywhere. Works with no component; the optional AnalyticsComponent and
/// [Track] attribute both funnel into <see cref="Track"/>.
/// </summary>
public static class Analytics
{
	static AnalyticsClient? _client;
	static bool _warned;

	public static bool IsInitialized => _client is not null;

	/// <summary>Configure and start the SDK. Idempotent: a second call is ignored.</summary>
	public static void Init( string apiKey, AnalyticsOptions? options = null )
	{
		if ( _client is not null )
		{
			Log.Warning( "[Analytics] Init called twice; ignoring." );
			return;
		}

		_client = new AnalyticsClient( apiKey, options ?? new AnalyticsOptions(), new HttpEventSender() );
		_client.Start();
	}

	/// <summary>Record a custom event. No-op (with a one-time warning) before Init.</summary>
	public static void Track( string type, object? properties = null, string? scene = null,
		Vector3? position = null, string? playerId = null )
	{
		if ( _client is null )
		{
			WarnNotInitialized();
			return;
		}

		_client.Enqueue( type, properties, scene, position, playerId );
	}

	/// <summary>Send buffered events immediately.</summary>
	public static void Flush() => _ = _client?.FlushAsync();

	/// <summary>Emit session_end, flush, and tear down.</summary>
	public static void Shutdown()
	{
		var client = _client;
		_client = null;
		_ = client?.ShutdownAsync();
	}

	static void WarnNotInitialized()
	{
		if ( _warned )
			return;
		_warned = true;
		Log.Warning( "[Analytics] Track called before Init — event dropped. Call Analytics.Init or add an AnalyticsComponent." );
	}

	// --- test seams ---
	internal static void InitForTests( IEventSender sender, AnalyticsOptions options )
	{
		_client = new AnalyticsClient( "pk_test", options, sender );
		_client.Start();
	}

	internal static Task FlushAsyncForTests() => _client?.FlushAsync() ?? Task.CompletedTask;

	internal static void ResetForTests()
	{
		_client = null;
		_warned = false;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~AnalyticsFacadeTests" --nologo`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/Analytics.cs UnitTests/AnalyticsFacadeTests.cs
git -C apps/sdk commit -m "feat: Analytics static facade"
```

---

### Task 8: `[Track]` attribute + `CaptureArgs`

**Files:**

- Create: `apps/sdk/Code/TrackAttribute.cs`
- Test: `apps/sdk/UnitTests/TrackArgsTests.cs`

The codegen wrapping only runs in the s&box runtime and `WrappedMethod`/`WrappedPropertySet` are engine structs we can't construct in MSTest. So we unit-test only the pure `CaptureArgs(int methodIdentity, Type declaringType, object[] args)` helper (name resolution + fallback). The attribute callbacks are thin shims that call `CaptureArgs` then `Analytics.Track` — verified manually in the editor.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/sdk/UnitTests/TrackArgsTests.cs
using Noot.Analytics;

[TestClass]
public class TrackArgsTests
{
    // a method whose identity we can look up via TypeLibrary
    public void Sample( float height, string surface ) { }

    [TestMethod]
    public void CaptureArgs_UnknownIdentity_FallsBackToPositional()
    {
        var props = TrackAttribute.CaptureArgs( -1, typeof( TrackArgsTests ), new object[] { 3.2f, "grass" } );

        Assert.AreEqual( 3.2f, props["arg0"] );
        Assert.AreEqual( "grass", props["arg1"] );
    }

    [TestMethod]
    public void CaptureArgs_NoArgs_ReturnsNull()
    {
        Assert.IsNull( TrackAttribute.CaptureArgs( -1, typeof( TrackArgsTests ), new object[0] ) );
    }
}
```

> The happy-path (named params via TypeLibrary) is exercised in-editor; the fallback path above is deterministic and CI-safe.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~TrackArgsTests" --nologo`
Expected: FAIL — `TrackAttribute` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
// apps/sdk/Code/TrackAttribute.cs
using System;
using System.Collections.Generic;
using Sandbox;

namespace Noot.Analytics;

/// <summary>
/// Declarative event tracking. Put on a method to emit when it is called, or on a
/// property to emit when it changes. Pure sugar over <see cref="Analytics.Track"/>;
/// requires the core to be initialized (otherwise Track no-ops).
/// </summary>
[AttributeUsage( AttributeTargets.Method | AttributeTargets.Property )]
[CodeGenerator( CodeGeneratorFlags.WrapMethod | CodeGeneratorFlags.Instance | CodeGeneratorFlags.Static,
	"Noot.Analytics.TrackAttribute.OnInvoked" )]
[CodeGenerator( CodeGeneratorFlags.WrapPropertySet | CodeGeneratorFlags.Instance | CodeGeneratorFlags.Static,
	"Noot.Analytics.TrackAttribute.OnSet" )]
public sealed class TrackAttribute : Attribute
{
	/// <summary>Event name. Null/empty → uses the member name.</summary>
	public string? Name { get; }

	/// <summary>Opt-in: capture method arguments as event properties. Ignored on properties.</summary>
	public bool Params { get; set; }

	public TrackAttribute( string? name = null ) => Name = name;

	/// <summary>Method-wrap callback (invoked by s&box codegen).</summary>
	public static void OnInvoked( WrappedMethod m, params object[] args )
	{
		m.Resume(); // run the real method first

		var attr = m.GetAttribute<TrackAttribute>();
		var type = string.IsNullOrEmpty( attr?.Name ) ? m.MethodName : attr!.Name!;
		var declaringType = m.Object?.GetType();
		var props = attr is { Params: true } && declaringType is not null
			? CaptureArgs( m.MethodIdentity, declaringType, args )
			: null;

		Analytics.Track( type, props );
	}

	/// <summary>Property-set-wrap callback (invoked by s&box codegen).</summary>
	public static void OnSet<T>( WrappedPropertySet<T> p )
	{
		var changed = !EqualityComparer<T>.Default.Equals( p.Getter(), p.Value );
		p.Setter( p.Value ); // apply the real set
		if ( !changed )
			return;

		var attr = p.GetAttribute<TrackAttribute>();
		var type = string.IsNullOrEmpty( attr?.Name ) ? p.PropertyName : attr!.Name!;
		Analytics.Track( type, new Dictionary<string, object> { ["value"] = p.Value! } );
	}

	/// <summary>
	/// Map positional arg values to a property dictionary. Resolves parameter names
	/// via TypeLibrary by method identity; falls back to arg0/arg1… Skips null args.
	/// </summary>
	public static Dictionary<string, object>? CaptureArgs( int methodIdentity, Type declaringType, object[] args )
	{
		if ( args is null || args.Length == 0 )
			return null;

		var names = ResolveParamNames( methodIdentity, declaringType, args.Length );
		var props = new Dictionary<string, object>( args.Length );
		for ( var i = 0; i < args.Length; i++ )
		{
			if ( args[i] is null )
				continue;
			props[names[i]] = args[i];
		}

		return props.Count > 0 ? props : null;
	}

	static string[] ResolveParamNames( int methodIdentity, Type declaringType, int count )
	{
		var names = new string[count];
		for ( var i = 0; i < count; i++ )
			names[i] = $"arg{i}";

		try
		{
			var td = TypeLibrary.GetType( declaringType );
			foreach ( var method in td.Methods )
			{
				if ( method.Identity != methodIdentity )
					continue;

				var parameters = method.Parameters;
				for ( var i = 0; i < count && i < parameters.Length; i++ )
					names[i] = parameters[i].Name ?? names[i];
				break;
			}
		}
		catch
		{
			// TypeLibrary unavailable (e.g. in a bare unit-test host) → positional names.
		}

		return names;
	}
}
```

> `TypeLibrary` is the global instance (`Sandbox.Internal.GlobalGameNamespace` brings it into scope via the csproj `Using`). `MethodDescription.Identity` matches `WrappedMethod.MethodIdentity`. If `.Identity` is named differently in your build, confirm via the editor; the fallback path still works.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --filter "FullyQualifiedName~TrackArgsTests" --nologo`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```
git -C apps/sdk add Code/TrackAttribute.cs UnitTests/TrackArgsTests.cs
git -C apps/sdk commit -m "feat: declarative [Track] attribute"
```

---

### Task 9: `AnalyticsComponent` (drop-in helper)

**Files:**

- Create: `apps/sdk/Code/AnalyticsComponent.cs`

Behavior depends on the live scene/network systems, so there is no MSTest here — it is verified in the editor (Task 14 manual checklist). Keep the logic thin so all real work lives in the already-tested core.

- [ ] **Step 1: Write the implementation**

```csharp
// apps/sdk/Code/AnalyticsComponent.cs
using Sandbox;

namespace Noot.Analytics;

/// <summary>
/// Optional drop-in. Auto-configures the Analytics core from editor fields and
/// emits the default events that need a scene/network presence
/// (scene_loaded, player_connected, player_disconnected). Session start/end are
/// owned by the core. Connect/disconnect fire on the host only.
/// </summary>
[Title( "Analytics" )]
[Category( "Analytics" )]
[Icon( "analytics" )]
public sealed class AnalyticsComponent : Component, Component.INetworkListener
{
	[Property] public string ApiKey { get; set; } = "";
	[Property] public string IngestUrl { get; set; } = "https://ingest.sbox-analytics.com";
	[Property] public bool TrackSessions { get; set; } = true;
	[Property] public bool TrackSceneLoads { get; set; } = true;
	[Property] public bool TrackConnections { get; set; } = true;
	[Property] public float FlushIntervalSeconds { get; set; } = 10f;
	[Property] public int MaxBatchSize { get; set; } = 50;

	bool _ownsClient;

	protected override void OnEnabled()
	{
		if ( Analytics.IsInitialized )
			return; // core already configured from code — just attach.

		Analytics.Init( ApiKey, new AnalyticsOptions
		{
			IngestUrl = IngestUrl,
			TrackSessions = TrackSessions,
			FlushIntervalSeconds = FlushIntervalSeconds,
			MaxBatchSize = MaxBatchSize,
		} );
		_ownsClient = true;
	}

	protected override void OnStart()
	{
		if ( TrackSceneLoads )
			Analytics.Track( "scene_loaded", scene: Scene?.Title ?? "" );
	}

	protected override void OnDestroy()
	{
		if ( _ownsClient )
			Analytics.Shutdown(); // emits session_end + final flush
	}

	void INetworkListener.OnActive( Connection channel )
	{
		if ( TrackConnections )
			Analytics.Track( "player_connected", playerId: AnonymousId.Hash( channel.SteamId ) );
	}

	void INetworkListener.OnDisconnected( Connection channel )
	{
		if ( TrackConnections )
			Analytics.Track( "player_disconnected", playerId: AnonymousId.Hash( channel.SteamId ) );
	}
}
```

> The `Analytics.Track(..., scene:)` call uses the `scene` parameter to set the top-level `scene` wire field. Confirm `Scene.Title` resolves a usable name in the editor; if it returns empty for code-built scenes, that's acceptable (`scene` defaults to `""`).

- [ ] **Step 2: Build to confirm it compiles**

Run: `dotnet build "apps/sdk/Code/analytics.csproj" --nologo`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```
git -C apps/sdk add Code/AnalyticsComponent.cs
git -C apps/sdk commit -m "feat: AnalyticsComponent drop-in helper"
```

---

### Task 10: Editor menu

**Files:**

- Create: `apps/sdk/Editor/AnalyticsMenu.cs`

- [ ] **Step 1: Write the implementation**

```csharp
// apps/sdk/Editor/AnalyticsMenu.cs
using Editor;
using Sandbox;
using Noot.Analytics;

/// <summary>Editor convenience: drop an AnalyticsComponent into the open scene.</summary>
public static class AnalyticsMenu
{
	[Menu( "Editor", "Analytics/Add to scene" )]
	public static void AddToScene()
	{
		var scene = SceneEditorSession.Active?.Scene;
		if ( scene is null )
		{
			EditorUtility.DisplayDialog( "Analytics", "Open a scene first." );
			return;
		}

		var go = scene.CreateObject();
		go.Name = "Analytics";
		go.Components.Create<AnalyticsComponent>();
	}
}
```

> If `SceneEditorSession.Active` is unavailable in your editor build, fall back to `EditorScene.Active` / the active scene accessor your editor version exposes. The menu is a convenience only.

- [ ] **Step 2: Build to confirm it compiles**

Run: `dotnet build "apps/sdk/Editor/analytics.editor.csproj" --nologo`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```
git -C apps/sdk add Editor/AnalyticsMenu.cs
git -C apps/sdk commit -m "feat: editor menu to add Analytics to a scene"
```

---

### Task 11: Full test + build gate

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --nologo`
Expected: PASS — all tests across AnalyticsEvent, AnonymousId, EventBuffer, AnalyticsClient, AnalyticsFacade, TrackArgs (plus the pre-existing `SceneTest` in `UnitTest.cs`).

- [ ] **Step 2: Build both runtime + editor projects**

Run: `dotnet build "apps/sdk/Editor/analytics.editor.csproj" --nologo`
Expected: Build succeeded (this transitively builds `Code/analytics.csproj`).

- [ ] **Step 3 (manual, in s&box editor): smoke-test the component**

Open the project in s&box, add the `Analytics` component to a scene, set a real `pk_…` key (point `IngestUrl` at `http://localhost:8080` with the ingest service running), press play. Confirm in the ingest logs that `session_start` + `scene_loaded` arrive, and that a `[Track]`-decorated method emits on call. Record the result in the PR description.

---

### Task 12: SDK markdown docs

**Files:**

- Modify: `apps/sdk/CLAUDE.md` (and its mirror `apps/sdk/AGENTS.md` — they are identical; edit both the same way)

- [ ] **Step 1: Replace the "Current state" line and document the real API**

In `apps/sdk/CLAUDE.md`, replace this block:

```markdown
> Current state: fresh s&box library template (`MyLibraryComponent`, `MyEditorMenu` are placeholders to be replaced).
```

with:

```markdown
> Current state: implemented. Public surface lives in `Code/` under namespace `Noot.Analytics`.

## Public API

Three ways to send events, all funneling into the same core:

- **`Analytics.Init(apiKey, options)` / `Track(type, props?, scene?, position?, playerId?)` / `Flush()` / `Shutdown()`** — the standalone core. No component required.
- **`AnalyticsComponent`** — optional drop-in. Set `ApiKey` in the inspector; it auto-`Init`s the core and emits `scene_loaded`, `player_connected`, `player_disconnected`. Owns `Shutdown` only if it did the `Init`.
- **`[Track("name")]`** on a method (emit on call; `Params = true` captures args) or property (emit `{ value }` on change). Codegen sugar over `Track`.

Default events: `session_start`/`session_end` (core), `scene_loaded` + `player_connected`/`player_disconnected` (component; connect/disconnect are host-only).

`player_id` is `AnonymousId.Hash(steamId)` — never raw SteamID.

## File map (`Code/`)

`AnalyticsEvent` (wire model) · `AnonymousId` (id hashing) · `EventBuffer` (buffer) · `IEventSender`/`HttpEventSender` (transport) · `AnalyticsOptions` (config) · `AnalyticsClient` (core) · `Analytics` (facade) · `TrackAttribute` (`[Track]`) · `AnalyticsComponent` (drop-in). Tests in `UnitTests/`; run with `dotnet test UnitTests/analytics.unittest.csproj`.
```

- [ ] **Step 2: Apply the identical edit to `apps/sdk/AGENTS.md`**

(`CLAUDE.md` and `AGENTS.md` in `apps/sdk` carry the same content — keep them in lockstep.)

- [ ] **Step 3: Commit (inside the SDK repo)**

```
git -C apps/sdk add CLAUDE.md AGENTS.md
git -C apps/sdk commit -m "docs: document implemented SDK API"
```

---

### Task 13: Fumadocs SDK page

**Files:**

- Create: `apps/fumadocs/content/docs/sdk.mdx`
- Modify: `apps/fumadocs/content/docs/meta.json`
- Modify: `apps/fumadocs/content/docs/index.mdx`

- [ ] **Step 1: Create the SDK page**

````mdx
---
title: SDK (s&box)
description: Drop the s&box Analytics SDK into your game to send events with one component, an attribute, or a line of code.
icon: Package
---

The **s&box Analytics SDK** is a C# library you add to your game. It batches events and ships them to the [Ingestion API](/docs/api) for you — handling sessions, batching, retries, and anonymization.

<Callout type="info">
  All three styles below send to the same place. Use the component for zero-code
  setup, the attribute for declarative tracking, and `Analytics.Track` for full
  control.
</Callout>

## Install

Add the `noot/analytics` library to your project's package references, then use the `Noot.Analytics` namespace.

## 1. Drop-in component (zero code)

Add an **Analytics** component to a GameObject (Editor → `Analytics/Add to scene`), then set your publishable key:

| Field                  | Default                             | Purpose                                                      |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `ApiKey`               | `""`                                | Your project's publishable `pk_…` key.                       |
| `IngestUrl`            | `https://ingest.sbox-analytics.com` | Override for self-host / local dev.                          |
| `TrackSessions`        | `true`                              | Emit `session_start` / `session_end`.                        |
| `TrackSceneLoads`      | `true`                              | Emit `scene_loaded` on each scene load.                      |
| `TrackConnections`     | `true`                              | Emit `player_connected` / `player_disconnected` (host only). |
| `FlushIntervalSeconds` | `10`                                | How often buffered events are sent.                          |
| `MaxBatchSize`         | `50`                                | Events per request.                                          |

That's it — default events flow automatically.

## 2. The `[Track]` attribute

Mark a method or property and the SDK emits an event for you:

```csharp
using Noot.Analytics;

[Track( "player_jumped" )]
public void Jump() { /* ... */ }                 // emits { type: player_jumped }

[Track( "player_jumped", Params = true )]
public void Jump( float height, string surface ) { /* ... */ }
// emits { type: player_jumped, properties: { height, surface } }

[Track( "score_changed" )]
public int Score { get; set; }                   // emits { value } whenever Score changes
```
````

<Callout type="warn">
  `[Track]` wraps the member at compile time. Don't put it on hot per-frame methods.
</Callout>

## 3. Imperative `Analytics.Track`

Full control — works with **no component** at all:

```csharp
using Noot.Analytics;

// once, at startup:
Analytics.Init( "pk_your_publishable_key" );

// anywhere:
Analytics.Track( "level_complete", new { level = "facility_01", deaths = 2 } );

// on shutdown:
Analytics.Shutdown();
```

`Analytics.Init` accepts an `AnalyticsOptions` for `IngestUrl`, `FlushIntervalSeconds`, `MaxBatchSize`, `TrackSessions`, and a `PlayerId` override.

## Default events

| Event                 | When                           | Notes                     |
| --------------------- | ------------------------------ | ------------------------- |
| `session_start`       | `Init` / component enable      | Once per session.         |
| `scene_loaded`        | Scene load                     | Carries the `scene` name. |
| `player_connected`    | A player joins                 | Host only.                |
| `player_disconnected` | A player leaves                | Host only.                |
| `session_end`         | `Shutdown` / component destroy | Final flush.              |

## Privacy

`player_id` is a one-way hash of the SteamID (`AnonymousId.Hash`) — the raw SteamID is **never** sent. See [API Keys](/docs/api-keys) for key handling.

<Cards>
  <Card title="Ingestion API" href="/docs/api">
    The HTTP endpoint the SDK posts to.
  </Card>
  <Card title="Events reference" href="/docs/api/events">
    The full wire shape of every event.
  </Card>
</Cards>
```

- [ ] **Step 2: Add the page to the nav**

Modify `apps/fumadocs/content/docs/meta.json` — add `"sdk"` after `"api"`:

```json
{
  "title": "s&box Analytics",
  "pages": [
    "index",
    "organizations",
    "projects",
    "api-keys",
    "dashboards",
    "api",
    "sdk"
  ]
}
```

- [ ] **Step 3: Link the SDK from the landing page**

In `apps/fumadocs/content/docs/index.mdx`, change the step-4 line of "Getting started" from:

```markdown
4. **Send events** from your game to the Ingestion API. See [API Usage](/docs/api).
```

to:

```markdown
4. **Send events** from your game. Use the [s&box SDK](/docs/sdk) for a one-component setup, or call the [Ingestion API](/docs/api) directly.
```

- [ ] **Step 4: Verify the docs build**

Run: `bun run --cwd apps/fumadocs build`
Expected: build succeeds, no MDX/frontmatter errors. (If `bun` scripts differ, use the build script defined in `apps/fumadocs/package.json`.)

- [ ] **Step 5: Commit (in the monorepo)**

```
git add apps/fumadocs/content/docs/sdk.mdx apps/fumadocs/content/docs/meta.json apps/fumadocs/content/docs/index.mdx
git commit -m "docs: add s&box SDK page to fumadocs"
```

---

### Task 14: Final verification

**Files:** none.

- [ ] **Step 1: SDK tests + build green**

Run: `dotnet test "apps/sdk/UnitTests/analytics.unittest.csproj" --nologo`
Expected: PASS.

- [ ] **Step 2: Fumadocs build green**

Run: `bun run --cwd apps/fumadocs build`
Expected: succeeds.

- [ ] **Step 3: Editor smoke-test recorded**

Confirm the manual editor check from Task 11 Step 3 was done and noted (session_start + scene_loaded + a custom event observed at the ingest endpoint).

- [ ] **Step 4: Review the spec's "Known constraints"** and confirm none were silently violated (process-scoped sessions, host-only defaults, no offline persistence, `[Track]` compile-time only).

---

## Self-Review notes (for the implementer)

- **Spec coverage:** every spec file (AnalyticsEvent, AnonymousId/PlayerId, EventBuffer, IEventSender/HttpEventSender, AnalyticsOptions, AnalyticsClient, Analytics, TrackAttribute, AnalyticsComponent, editor menu) maps to a task; docs updates map to Tasks 12–13.
- **Naming:** spec's `PlayerId.cs` is implemented as `AnonymousId.cs` (Task 2) to avoid a clash with the `PlayerId` property on `AnalyticsClient`. The hashing call is `AnonymousId.Hash(...)` everywhere (Tasks 6, 9).
- **Types are consistent across tasks:** `Analytics.Track(string, object?, string?, Vector3?, string?)`, `AnalyticsClient.Enqueue(...)` (same signature), `IEventSender.SendAsync(List<AnalyticsEvent>, string, string)`, `EventBuffer.MaxBatchSize/MaxPropertiesBytes`, `AnalyticsEvent.ToPayload()`.
- **`internal` test access** is granted once in `Code/AssemblyInfo.cs` (Task 6 Step 3b) and used by Tasks 6 and 7.
