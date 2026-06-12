# Product Features

## Core Platform

- **Authentication**: Email/password + OAuth (Discord, Steam) via Better Auth
- **Organizations**: Multi-user orgs with permission levels (Owner, Admin, Viewer)
- **Projects**: Create and configure projects, receive API key pairs (publishable + secret)
- **Event Ingestion API**: HTTP POST `/v1/events` with batch support
- **Spatial Read API**: HTTP GET `/v1/spatial/voxels` + `/v1/spatial/scenes` on ingest, secret-key (`sk_`) auth, consumed by the SDK's editor heatmap tooling
- **Dashboard**: Real-time event stream, DAU/WAU/MAU, session count, average session duration

## Analytics Capabilities

- **Core Events**: session_start, session_end, player_death, level_complete, custom_event
- **Retention Analytics**: Cohort-based Day-1/7/30 retention curves
- **Funnel Analysis**: Visual funnel builder for player progression
- **Player Profiles**: Anonymous player journey tracking (not PII-linked)
- **Performance Events**: FPS drops, load times, crash reporting
- **Metrics**: Named, saved query definitions (aggregation or expression, event-type + property filters) reused by widgets and alerts
- **Alerts**: Threshold rules on saved metrics (Above/Below, LastHour/Last24Hours/Last7Days windows) with webhook and email delivery, 1-hour cooldown; org-wide or per-project scope; evaluation is on-demand ("Run check") — scheduler is a follow-up

## Advanced Features

- **Raw Data Export**: Parquet/CSV export to S3
- **Custom Dashboards**: Free-form 12-column grid (react-grid-layout) of saved widgets — a widget pairs a metric with a visualization (number, area, bar, table) — with explicit save / unsaved-changes bar and a two-step add-widget flow
- **A/B Testing Framework**: Built-in experiment assignment and significance testing
- **Billing & Usage**: Polar.sh integration, usage-based pricing, invoices

## SDK

s&box library `noot.analytics` (namespace `Noot.Analytics`), mounted at `apps/sdk`:

- **Core**: `Analytics.Init/Track/Flush/Shutdown` facade over a buffered, batched HTTP sender
- **Components**: `AnalyticsComponent` ("Analytics Session Helper" — init, session/scene/connection events, AutoScene/AutoPosition tagging) and `AnalyticsMovementComponent` ("Analytics Movement Tracker" — throttled `position_sample` spatial events)
- **Declarative**: `[Track]` attribute on methods/properties
- **Editor tooling**: "Analytics" dock with fog (raymarched volume) and voxel (instanced cubes) heatmap visualizers, querying `/v1/spatial/*` with the secret key (stored editor-local)

## API Contract (v1)

```
POST /v1/events
Headers: X-Api-Key: {publishable_key}
Body: {
  "events": [
    {
      "type": "session_start",
      "timestamp": "2026-05-06T12:00:00Z",
      "session_id": "uuid",
      "player_id": "anon_hash",
      "properties": { "map": "de_dust2", "game_mode": "competitive" }
    }
  ]
}
```
