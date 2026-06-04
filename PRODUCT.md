# Product

## Register

product

## Users

Indie s&box game developers and small studios (secondary: mod creators, mid-size studios). They open the dashboard mid-development-session to answer concrete questions: who plays my game, when, on what maps, does it perform. Context is a second monitor next to their editor; they want answers in seconds, not exploration journeys.

## Product Purpose

Real-time analytics purpose-built for s&box games: player behavior, session tracking, retention, and performance monitoring. Exists because general-purpose analytics (GA-style) model pageviews and marketing funnels, not game sessions and in-world events. Success: a developer instruments with the C# SDK in minutes and trusts the dashboard as their daily readout.

## Brand Personality

Developer-first, fast, no-bloat. Tone of a good engineering tool: precise, quiet, dense where density helps. Positioning line: "Analytics built for s&box developers — not marketers."

## Anti-references

- Marketer dashboards (Google Analytics, HubSpot): conversion-speak, campaign metaphors, wizard flows.
- Enterprise BI chrome: KPI hero banners, gradient stat cards, dashboard-builder clutter.
- Gamified SaaS onboarding: confetti, streak nags, mascot copy.

## Design Principles

1. **Game vocabulary, not web vocabulary.** Sessions, players, maps, FPS — never "users", "pageviews", "conversions".
2. **Answer-shaped screens.** Each view answers a named question a developer actually asks; remove anything that doesn't serve it.
3. **Density is respect.** Developers read tables and grids fluently; prefer one dense, scannable surface over paginated fluff.
4. **Consistency over surprise.** Same panel, table, and chart vocabulary on every screen; delight lives in small touches (avatars, count-ups), not layout novelty.
5. **Privacy visible by design.** Player identity is anonymous hashes; the UI should make that legible, not hide it.

## Accessibility & Inclusion

No formal WCAG target declared; follow Ultracite a11y rules (semantic HTML, labels, keyboard parity). Charts and heatmaps need non-color-only encodings (tooltips with values, text summaries). Honor reduced motion: animations are opt-in per the `animated` prop convention.
