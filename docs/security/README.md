# Security Test Suite

This directory contains the security verification artifacts and helpers:

| File | Purpose |
|---|---|
| `security-definer-accepted.md` | Threat model + reviewer checklist for the 3 accepted SECURITY DEFINER helpers. |
| `rls-policies.md` | Reference for RLS policies, triggers, audit log. |
| `scan-history.json` | Append-only history of CI security scan runs. Powers the in-app **Admin → Security Trend** chart. |
| `cron-secret.md` | Cron + service-role secret usage. |

## Running RLS tests locally

The RLS test suite hits the **live** Supabase REST + Realtime APIs to verify
policy behavior end-to-end. There is no local Postgres mock — you need real
JWTs.

### 1. Set environment variables

Create a local `.env.security` (git-ignored) or export inline:

```bash
# Required — project URL + anon key
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-publishable-key>"

# Optional — enables tests that require a signed-in user
# Get from: sign in to the app in browser → DevTools → Application → Local Storage
#           → sb-<ref>-auth-token → "access_token" field
export USER_JWT="<non-admin-user-access-token>"
export ADMIN_JWT="<admin-user-access-token>"
export ADMIN_USER_ID="<admin-user-uuid>"
```

> ⚠️ **Never commit these values.** Access tokens expire in ~1 hour; refresh
> them by signing in again. For CI, add them as repo/workspace secrets with
> the same names.

### 2. Run the suite

```bash
npm run test:security
# or, with bun:
bun run test:security
```

Without `USER_JWT` / `ADMIN_JWT`, the suite still runs and verifies that
**anonymous** callers are blocked. The admin/non-admin assertions are
auto-skipped — vitest reports them as `skipped`, not failed.

### 3. Just one file

```bash
bunx vitest run src/test/rlsTables.security.test.ts
```

## What the tests cover

| File | Tables / surface |
|---|---|
| `src/test/userRoles.security.test.ts` | `user_roles` INSERT/DELETE for anon, non-admin, admin. |
| `src/test/rlsTables.security.test.ts` | SELECT on `provider_status`, `sync_jobs`, `admin_audit_log` for anon, non-admin, admin. |
| `src/test/auditLogRealtime.security.test.ts` | Realtime INSERT events on `admin_audit_log` are delivered to admins only. |

## CI integration

The GitHub Actions workflow (`.github/workflows/security-scan.yml`) runs the
same `test:security` script on every PR, uploads the JSON results as an
artifact, posts a per-policy summary table to the PR, appends the run to
`scan-history.json`, and escalates new high-severity findings to Slack +
Discord webhooks if configured.
