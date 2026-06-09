# `packages/email` — Resend Transport

The single place that talks to Resend. Owns the client bootstrap, the dev fallback, and the `from`/`send` call shape so callers never import `resend` directly.

## Layout

```
src/index.ts   # sendEmail({ to, subject, html }) + canSendEmail
```

## Conventions

- **Transport only — no templates.** HTML lives with the domain that owns it (`packages/auth` builds invitation/verification HTML; `packages/api` alerts build their own body). Don't grow this into a templating or queue layer until a third caller actually needs it.
- **`canSendEmail`** reflects whether `RESEND_API_KEY` is configured. Gate features that can't work without real delivery (e.g. email verification) on it.
- **Dev fallback**: with no key set, `sendEmail` logs the subject + recipient and returns. A caller that needs richer dev output (an invite link to click) should branch on `!canSendEmail` itself before calling.
- **Never read secrets from `process.env`** — go through `@sbox-analytics/env/server`.
