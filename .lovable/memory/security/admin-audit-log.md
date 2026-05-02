---
name: Admin Audit Log
description: admin_audit_log table, append-only triggers, admin-only RLS read, realtime, and the Admin → Audit Log tab with server-side pagination, search, and diff viewer
type: feature
---
- Table `public.admin_audit_log` (id, created_at, actor_user_id, action, target_table, target_id, old_values jsonb, new_values jsonb).
- Policies: admin-only `admin_audit_log_read` (no moderator path), and three RESTRICTIVE write-blocking policies (`admin_audit_log_block_insert/update/delete`). Never use `FOR ALL AS RESTRICTIVE` here — it also blocks SELECT.
- Triggers (only writers, SECURITY DEFINER, bypass RLS):
  - `trg_audit_user_roles` on user_roles INSERT/DELETE → `role_grant` / `role_revoke`.
  - `trg_audit_market_intel` on market_intel INSERT/UPDATE/DELETE → `intel_create`, `intel_topic_change` (only when is_premium or intel_type changes), `intel_delete`.
- Realtime: `admin_audit_log` is in `supabase_realtime` with `REPLICA IDENTITY FULL`. The Admin → Audit Log tab subscribes for live toast notifications and inline list prepend (page 0 only).
- Server-side pagination + free-text search via `public.search_admin_audit_log(p_search, p_action, p_actor, p_from, p_to, p_limit, p_offset)` — SECURITY DEFINER, internally requires `has_role(auth.uid(),'admin')`. Returns matching rows with `total_count` for "page X of Y". UI uses 50/page Next/Prev controls and CSV/JSON export of the current page.
- Diff viewer: compares `old_values` / `new_values` field-by-field; renders `- old / + new` per changed key (red/green) instead of raw JSON; renders pure inserts/deletes as a single-column field list.
- `has_role` and `get_subscription_tier` keep EXECUTE granted to `authenticated` (required by RLS + client tier checks). Trigger functions and `test_user_roles_protection` remain revoked from PUBLIC/anon/authenticated.
- Tests: `src/test/userRoles.security.test.ts` (RLS) and `src/test/auditLogRealtime.security.test.ts` (admin receives realtime INSERTs; non-admin/anon do not).
- Docs: `docs/security/rls-policies.md`.
