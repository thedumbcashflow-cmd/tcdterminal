---
name: Edge Function CORS Allowlist
description: Strict origin allowlist applied across all Supabase edge functions; no wildcards remain
type: constraint
---
All edge functions enforce a strict CORS origin allowlist via `corsFor(req)` helper:

ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
]

Rules:
- If Origin header is present and not in allowlist → return 403 immediately on every method including OPTIONS preflight.
- If Origin header is missing (cron / webhooks / server-to-server) → allow.
- The allowed origin is reflected in `Access-Control-Allow-Origin`; never use `*`.
- Apply on success, error, and `/health` responses.

To add an origin: append to `ALLOWED_ORIGINS` array in each function's `index.ts`. There is no shared module — duplication is intentional for edge function isolation.

Functions covered: chat, data-room-proxy, analyze-market, fetch-prices, macro-snapshot, create-checkout, paypal-client-token, sync-market-data, payment-webhook (allows no-Origin for PayPal), check-expired-trials (allows no-Origin for cron).
