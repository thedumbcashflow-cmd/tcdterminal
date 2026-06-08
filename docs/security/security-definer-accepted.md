# Accepted SECURITY DEFINER Helpers — Threat Model & Safeguards

The Supabase linter raises `0029_authenticated_security_definer_function_executable`
for three helpers that the `authenticated` role can `EXECUTE`. This document explains
why the finding is **intentionally accepted**, the threat model, the compensating
controls, and the checklist reviewers must run before approving any change that
touches these helpers.

## Functions covered

| Function | Returns | Why `EXECUTE` to `authenticated` is required |
|---|---|---|
| `public.has_role(uuid, app_role)` | `boolean` | Referenced inside RLS expressions across every gated table (`market_intel`, `provider_status`, `sync_jobs`, `admin_audit_log`, etc.) **and** called by client tier checks (`useIsAdmin`, admin console gates). Revoking `EXECUTE` causes `permission denied for function has_role` and breaks every admin/whale/pro experience. |
| `public.get_subscription_tier(uuid)` | `subscription_tier` | Used in the tier-gating expression on `market_intel` reads and in `enforce_watchlist_limit()`. Client also calls it for live tier reads. |
| `public.search_admin_audit_log(...)` | `setof admin_audit_log` | Admin-only paginated search used by the Audit Log tab. Self-checks `has_role(auth.uid(), 'admin')` and raises if the caller is not an admin. |

`prevent_tier_self_modification`, `enforce_watchlist_limit`, `handle_new_user`,
`audit_user_roles`, `audit_market_intel`, `purge_old_proxy_logs`, and
`test_user_roles_protection` are also `SECURITY DEFINER` but `EXECUTE` is **revoked**
from `PUBLIC`, `anon`, and `authenticated` — they only run from triggers, cron, or
service-role contexts. The linter does not flag those.

## Threat model

| Threat | Likelihood | Mitigation |
|---|---|---|
| Authenticated caller impersonates another user via `has_role(other_uid, 'admin')` | Low | Function is a pure read against `public.user_roles`; it does not write or escalate. Returning `true` does not grant a role — the caller still has to satisfy the policy on whatever table they query, which itself runs as the caller. Knowing whether a *specific* user holds a role is not sensitive in this app (role assignments are visible to the audit log + admin console anyway). |
| Authenticated caller enumerates all admins | Low | `has_role` only answers `(uuid, role) → bool`; it does not list rows. `user_roles` SELECT policies let users read **their own** roles plus admin/moderator visibility — same surface the helper exposes. |
| Caller bypasses `search_admin_audit_log` admin gate | None | Function self-checks `has_role(auth.uid(), 'admin')` in its body and raises `admin role required` otherwise. The gate is server-side and cannot be skipped. |
| NULL-based bypass (`has_role(NULL, 'admin')` returning NULL in a policy expression) | Mitigated | `has_role` returns `false` for any NULL argument (see `docs/security/rls-policies.md`). Covered by `test_user_roles_protection`. |
| Function body mutated to widen access | Medium impact / Low likelihood | All changes flow through migrations reviewed via the checklist below; CI runs `test_user_roles_protection` and the RLS test suite on every PR. |

## Safeguards in place

1. **NULL-safe bodies.** `has_role` short-circuits to `false` when either argument is NULL.
2. **Stable + search_path pinned.** All three functions declare `STABLE SECURITY DEFINER SET search_path = public` to prevent search-path hijacking.
3. **RESTRICTIVE RLS floor.** Sensitive tables (`user_roles`, `admin_audit_log`, `provider_status`, `sync_jobs`) have RESTRICTIVE policies so a misbehaving permissive policy cannot widen access on its own.
4. **Audit triggers.** Role grants/revokes and intel changes are written to `admin_audit_log` by `SECURITY DEFINER` triggers that the helpers cannot bypass.
5. **Self-test RPC.** `public.test_user_roles_protection()` is run by CI and asserts every safeguard (NULL guards, RESTRICTIVE policies, audit triggers, creator-has-admin) is intact.
6. **Automated RLS tests.** `src/test/*.security.test.ts` exercise admin / non-admin / anonymous paths against the live REST and Realtime APIs.

## Reviewer checklist

Before merging any PR that touches `has_role`, `get_subscription_tier`,
`search_admin_audit_log`, or their `GRANT`s:

- [ ] `has_role` still returns `false` for NULL `_user_id` or NULL `_role`.
- [ ] `search_path = public` and `SECURITY DEFINER` are still present.
- [ ] `EXECUTE` is granted **only** to `authenticated` (never `anon`, never `PUBLIC`).
- [ ] `search_admin_audit_log` still self-checks `has_role(auth.uid(), 'admin')` at the top of its body.
- [ ] No new `SECURITY DEFINER` helper has been added with `EXECUTE` to `authenticated` without a matching entry in this document.
- [ ] `SELECT * FROM public.test_user_roles_protection();` returns every row `passed=true` (run as admin in SQL editor).
- [ ] `bunx vitest run src/test/*.security.test.ts` passes locally (or in CI) with admin + non-admin JWTs configured.
- [ ] If the helper signature changed, every RLS policy that references it has been re-checked for the new argument order.

## When to revisit

Revoke `EXECUTE` from `authenticated` and remove the accepted-warning entry from
security memory if **all** of the following become true:

1. No RLS policy references the helper directly (policies have been refactored to
   inline the check or call a different gate).
2. No client code reads the helper via PostgREST RPC (`supabase.rpc('has_role', …)`).
3. The audit-log search has been moved to a dedicated edge function with its own
   admin JWT verification, removing the need for `search_admin_audit_log` to be
   reachable from the Data API.
