---
name: Admin Audit Log
description: admin_audit_log table + triggers recording role changes and market_intel premium/topic assignments
type: feature
---
- Table `public.admin_audit_log` (id, created_at, actor_user_id, action, target_table, target_id, old_values, new_values jsonb).
- Append-only: RLS RESTRICTIVE policy blocks all client writes; SECURITY DEFINER triggers are the only writers.
- Read access: admins only.
- Triggers:
  - `trg_audit_user_roles` (AFTER INSERT/DELETE on user_roles) → actions `role_grant`, `role_revoke`.
  - `trg_audit_market_intel` (AFTER INSERT/UPDATE/DELETE on market_intel) → actions `intel_create`, `intel_topic_change` (only when is_premium or intel_type changes), `intel_delete`.
- `has_role(uuid, app_role)` is NULL-safe: returns false if either argument is NULL. EXECUTE revoked from PUBLIC/anon/authenticated.
- Smoke test: `SELECT * FROM public.test_user_roles_protection()` (admin-only).
- Docs: `docs/security/rls-policies.md`. API tests: `src/test/userRoles.security.test.ts`.
