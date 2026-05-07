# CRON_SECRET — Setup, Storage & Rotation

`CRON_SECRET` is a shared bearer token used to authenticate the **internal cron caller** (pg_cron via `pg_net`) when it invokes protected edge functions:

- `check-expired-trials` — nightly trial-expiration sweep (rejects requests without the secret)
- `sync-market-data` — accepts EITHER the cron secret OR an admin JWT (the Admin UI uses the JWT path automatically via `supabase.functions.invoke`)

Both functions read it from `Deno.env.get("CRON_SECRET")` and compare against the `X-Cron-Secret` request header.

---

## 1. Generate a value

Use a high-entropy random string (≥32 bytes, hex):

```bash
openssl rand -hex 32
# or
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## 2. Store it as an env var

| Environment | How to set it |
| --- | --- |
| **Production / Live backend** | Lovable Cloud → Connectors → Lovable Cloud → **Secrets** → add/update `CRON_SECRET`. |
| **Staging / Test backend** | Same panel, on the Test instance. Use a **different** value from production. |
| **Local development** | `supabase/.env.local` → `CRON_SECRET=...` then `supabase functions serve`. Never commit. |

The value is already injected into every edge function deploy — no code change needed when rotating.

## 3. Schedule the nightly cron job (one-time)

Run this once in the SQL editor on the Cloud backend, replacing `__YOUR_CRON_SECRET__` with the value you just stored. (We do **not** check this SQL into a migration because it contains the secret and the project URL.)

```sql
-- Enable extensions if not already on
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nightly at 03:15 UTC: expire trials
select cron.schedule(
  'check-expired-trials-nightly',
  '15 3 * * *',
  $$
  select net.http_post(
    url     := 'https://kkrryfpmbpwvucpmsarz.supabase.co/functions/v1/check-expired-trials',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  '__YOUR_CRON_SECRET__'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Every 10 min: refresh market data
select cron.schedule(
  'sync-market-data-10m',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://kkrryfpmbpwvucpmsarz.supabase.co/functions/v1/sync-market-data',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Cron-Secret',  '__YOUR_CRON_SECRET__'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To inspect or remove:

```sql
select * from cron.job;
select cron.unschedule('check-expired-trials-nightly');
select cron.unschedule('sync-market-data-10m');
```

## 4. Rotation (every 90 days, or on suspected leak)

1. Generate a new value (Step 1).
2. Update the env var in Cloud → Secrets (Step 2). Edge functions pick up the new value on next cold start (≈seconds).
3. Re-run the `cron.schedule` SQL above with the new value — `cron.schedule` upserts by job name, so the existing entries are replaced atomically.
4. Verify: tail edge function logs and confirm the next scheduled invocation returns 200, not 401.

## 5. Local testing

```bash
curl -X POST http://localhost:54321/functions/v1/check-expired-trials \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

A missing or wrong header returns `401 {"error":"Unauthorized"}`.
