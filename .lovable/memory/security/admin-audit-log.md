---
name: Admin Audit Log
description: admin_audit_log table + triggers + realtime + AuditLog admin tab with CSV/JSON export
type: feature
---
- Table `public.admin_audit_log` (id, created_at, actor_user_id, action, target_table, target_id, old_values, new_values jsonb).
- Append-only: RLS RESTRICTIVE policy blocks all client writes; SECURITY DEFINER triggers are the only writers. Admins can SELECT.
- Triggers:
  - `trg_audit_user_roles` (AFTER INSERT/DELETE on user_roles) → `role_grant`, `role_revoke`.
  - `trg_audit_market_intel` (AFTER INSERT/UPDATE/DELETE on market_intel) → `intel_create`, `intel_topic_change` (only when is_premium or intel_type changes), `intel_delete`.
- Realtime: `admin_audit_log` is in `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Admin AuditLog tab subscribes for live toast notifications.
- UI: `src/components/admin/AuditLog.tsx` mounted as the "Audit Log" admin tab (admin role only). Filters by actor_user_id, action, and date range. Exports filtered results as CSV or JSON.
- `has_role(uuid, app_role)` is NULL-safe. EXECUTE revoked from PUBLIC/anon/authenticated on every public SECURITY DEFINER (including `test_user_roles_protection`).
- Smoke test: admins can run `SELECT * FROM public.test_user_roles_protection()` only via service role / SQL editor.
- Docs: `docs/security/rls-policies.md`. API tests: `src/test/userRoles.security.test.ts`.
