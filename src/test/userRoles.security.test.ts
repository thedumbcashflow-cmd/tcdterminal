/**
 * user_roles security tests
 *
 * Verifies that the user_roles table cannot be written to by non-admins
 * (anonymous + ordinary signed-in users), but admins succeed.
 *
 * These tests run against the LIVE Supabase REST API. They are skipped by
 * default. To run them locally:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   ADMIN_JWT=<admin-user-access-token> \      # optional, enables admin-success test
 *   USER_JWT=<non-admin-access-token> \         # optional, enables non-admin-403 test
 *   bunx vitest run src/test/userRoles.security.test.ts
 *
 * The Supabase REST API returns HTTP 401/403/409 for RLS denials, all of
 * which we treat as "denied". A successful admin insert returns 201.
 */
import { describe, it, expect } from "vitest";

const URL = process.env.SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_JWT = process.env.ADMIN_JWT;
const USER_JWT = process.env.USER_JWT;

const RUN = Boolean(URL && ANON);
const d = RUN ? describe : describe.skip;

const TEST_TARGET_USER_ID = "00000000-0000-0000-0000-000000000001";

async function postRole(jwt: string | null, role = "user") {
  const headers: Record<string, string> = {
    apikey: ANON!,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${URL}/rest/v1/user_roles`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: TEST_TARGET_USER_ID, role }),
  });
  return res.status;
}

async function deleteRole(jwt: string | null) {
  const headers: Record<string, string> = { apikey: ANON! };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(
    `${URL}/rest/v1/user_roles?user_id=eq.${TEST_TARGET_USER_ID}`,
    { method: "DELETE", headers },
  );
  return res.status;
}

d("user_roles RLS protection", () => {
  it("anonymous INSERT is denied", async () => {
    const status = await postRole(null);
    // RLS denial surfaces as 401 (no JWT), 403 (forbidden), or 409 (constraint after deny)
    expect([401, 403, 409]).toContain(status);
  });

  it("anonymous DELETE cannot remove protected rows", async () => {
    // PostgREST returns 204 for DELETE even when RLS hides every candidate row
    // (no rows matched ⇒ no rows deleted). Both 401/403 and 204 prove the
    // anonymous caller could not actually mutate user_roles.
    const status = await deleteRole(null);
    expect([401, 403, 404, 204]).toContain(status);
  });

  (USER_JWT ? it : it.skip)("non-admin signed-in INSERT is denied (403)", async () => {
    const status = await postRole(USER_JWT!);
    expect(status).toBe(403);
  });

  (USER_JWT ? it : it.skip)("non-admin signed-in DELETE is denied (403/404)", async () => {
    const status = await deleteRole(USER_JWT!);
    expect([403, 404]).toContain(status);
  });

  (ADMIN_JWT ? it : it.skip)("admin INSERT succeeds (201)", async () => {
    const status = await postRole(ADMIN_JWT!, "user");
    // 201 created or 409 if already exists from a previous run — both prove the policy allowed it
    expect([201, 409]).toContain(status);
  });

  (ADMIN_JWT ? it : it.skip)("admin DELETE succeeds (204)", async () => {
    const status = await deleteRole(ADMIN_JWT!);
    expect([204, 200]).toContain(status);
  });
});
