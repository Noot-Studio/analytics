# Product Features

## Core Platform

- **Authentication**: Email/password + OAuth (Discord, Steam) via Better Auth
- **Organizations**: Multi-user orgs with permission levels (Owner, Admin, Viewer)
- **Projects**: Create and configure projects, receive API key pairs (publishable + secret)
- **Event Ingestion API**: HTTP POST `/v1/events` with batch support
- **Dashboard**: Real-time event stream, DAU/WAU/MAU, session count, average session duration

## Analytics Capabilities

- **Core Events**: session_start, session_end, player_death, level_complete, custom_event
- **Retention Analytics**: Cohort-based Day-1/7/30 retention curves
- **Funnel Analysis**: Visual funnel builder for player progression
- **Player Profiles**: Anonymous player journey tracking (not PII-linked)
- **Performance Events**: FPS drops, load times, crash reporting
- **Alerts**: Webhook and email alerts for anomaly detection (error spikes, DAU drops)

## Advanced Features

- **Raw Data Export**: Parquet/CSV export to S3
- **Custom Dashboards**: User-built dashboards with drag-and-drop widgets
- **A/B Testing Framework**: Built-in experiment assignment and significance testing
- **Billing & Usage**: Polar.sh integration, usage-based pricing, invoices

## SDK

NuGet package `Noot.Analytics.Sdk` with automatic s&box integration.

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
