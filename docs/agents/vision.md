# Product Vision

## What This Is

A real-time analytics platform built specifically for s&box game developers. It provides player behavior insights, session tracking, and performance monitoring without the bloat of general-purpose analytics tools.

## Target Users

- **Primary**: Indie s&box game developers and small studios
- **Secondary**: Mod creators and community content builders
- **Tertiary**: Mid-size studios scaling s&box titles

## Value Proposition

- **Game-native**: Pre-built events for player death, item pickup, session start/end, level completion — no custom instrumentation needed for common game events
- **s&box-native SDK**: Drop-in C# library with automatic s&box lifecycle hooks
- **Privacy-first**: No PII collection, GDPR-compliant by design, data residency options
- **Performance-conscious**: Async batching, minimal overhead (<1ms per event)
- **Community pricing**: Free tier for hobbyists, transparent pricing for commercial use

## Differentiation

| Dimension    | General Analytics (e.g. Google Analytics) | s&box Analytics                               |
| ------------ | ----------------------------------------- | --------------------------------------------- |
| Event model  | Pageviews / clicks                        | Game sessions, player states, in-world events |
| Real-time    | ~24h delay                                | <5s latency                                   |
| Game metrics | None built-in                             | DAU/MAU, retention curves, session length     |
| SDK          | JavaScript                                | C# native for s&box                           |
| Privacy      | Complex opt-out                           | Privacy by default                            |

## Positioning

> "Analytics built for s&box developers — not marketers."

Focus on game-native events, privacy, and performance.
