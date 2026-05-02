I found the immediate cause of the current `Access Denied` for `thedumbcashflow@gmail.com`: the account still exists as `admin` with `whale` tier in the database, but the last hardening pass revoked `EXECUTE` on `public.has_role(...)` from authenticated users. The app still calls that helper directly, and several RLS policies also depend on it, so those requests now fail with `permission denied for function has_role` instead of returning the admin role.

I also found a second audit-log policy issue: the current `Block client writes audit log` policy is `FOR ALL AS RESTRICTIVE USING (false)`, which can also block reads because `ALL` applies to `SELECT`. The audit log needs write-blocking policies that apply only to write operations, plus a dedicated admin-only read policy.

## Implementation plan

1. Restore creator/admin access without weakening role security
   - Add a migration that restores the minimal required `EXECUTE` grants for helpers that are used by client code and RLS:
     - `GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated`
     - `GRANT EXECUTE ON FUNCTION public.get_subscription_tier(uuid) TO authenticated` if needed for tier-gated RLS stability.
   - Keep trigger-only audit functions non-callable from clients:
     - `audit_user_roles()` remains revoked from `PUBLIC`, `anon`, `authenticated`.
     - `audit_market_intel()` remains revoked from `PUBLIC`, `anon`, `authenticated`.
     - `test_user_roles_protection()` remains revoked from public API access unless it is intentionally re-enabled later.
   - Re-run the idempotent creator guarantee in the migration:
     - ensure `thedumbcashflow@gmail.com` has `admin` in `user_roles`.
     - ensure the profile tier is `whale`, preserving the requested “bypass all tier plans / access everything” behavior through the existing admin + whale checks.
   - Update frontend permission checks to handle RPC errors explicitly so future permission-grant regressions show a useful error rather than silently treating admin as false.

2. Fix `admin_audit_log` RLS to match the security requirement
   - Drop the broad restrictive `FOR ALL` audit-log policy.
   - Create a dedicated admin read policy named clearly, e.g. `admin_audit_log_read`:
     - `FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))`
     - No moderator path.
   - Create separate write-blocking policies for client writes only:
     - `admin_audit_log_block_insert`
     - `admin_audit_log_block_update`
     - `admin_audit_log_block_delete`
     - all with `false` conditions.
   - Preserve trigger-based append-only writes from the existing security-definer trigger functions.

3. Add server-side pagination beyond 500 entries
   - Update `src/components/admin/AuditLog.tsx` to use real paged queries with `.range(from, to)` and `{ count: 'exact' }`.
   - Add `Next` / `Previous` controls, current page, page size, and total count.
   - Reset to page 1 when filters/search change.
   - Keep CSV/JSON export scoped to the currently filtered result set; if practical, export all rows in the selected date/search filter by fetching in batches instead of only the visible page.

4. Add free-text audit-log search
   - Add a search input for actor, action, target table, target id, and JSON content.
   - For actor display names/usernames, fetch matching profile IDs and include them in the filter.
   - Apply server-side filters where possible:
     - `action.ilike.%term%`
     - `target_table.ilike.%term%`
     - `target_id.ilike.%term%`
     - `old_values::text` / `new_values::text` search via a safe backend helper if REST filtering is insufficient for JSONB text.
   - If JSON text search cannot be expressed cleanly via the client query builder, add a SECURITY DEFINER read function that internally verifies `has_role(auth.uid(), 'admin')` and returns paginated filtered audit rows. This function will be admin-only and documented.

5. Replace raw JSON strings with a formatted diff viewer
   - Add a compact diff renderer in the audit table.
   - Compare keys from `old_values` and `new_values`.
   - Render changed fields as rows with:
     - field name
     - old value highlighted red
     - new value highlighted green
   - Render additions/removals clearly for `role_grant`, `role_revoke`, `intel_create`, and `intel_delete`.
   - Keep the high-density terminal style; no redesign.

6. Add automated realtime notification coverage
   - Add a Vitest security/integration test for `admin_audit_log` realtime behavior.
   - Test intent:
     - admin JWT can subscribe to `admin_audit_log` INSERT events and receive a notification/payload.
     - non-admin JWT cannot successfully receive those events.
   - The test will be skipped unless the required test environment variables are provided, matching the current `userRoles.security.test.ts` pattern.
   - Include a small helper to create/trigger a test audit event only when an admin token is provided, without requiring destructive cleanup.

7. Update docs/memory for future safety
   - Update `docs/security/rls-policies.md` to describe the corrected audit-log policies and why write-blocking policies must not be `FOR ALL`.
   - Update the admin audit log memory to reflect pagination/search/diff viewer and the admin-only read policy.
   - Note that `has_role` must remain callable by authenticated users if it is used in RLS/client role checks; trigger functions remain revoked.

8. Verification after implementation
   - Confirm `thedumbcashflow@gmail.com` no longer sees `Access Denied` and is treated as admin + whale.
   - Confirm audit log loads entries past 500 using Next/Previous.
   - Confirm free-text search filters by actor/action/target/JSON content.
   - Confirm moderators cannot see the Audit Log tab and cannot read `admin_audit_log` rows by policy.
   - Run the database linter again and verify no new security warnings are introduced beyond the existing extension warning, if it still remains.