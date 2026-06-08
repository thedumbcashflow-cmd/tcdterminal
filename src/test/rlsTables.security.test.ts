/**
 * RLS protection tests for provider_status, sync_jobs, admin_audit_log.
 *
 * Verifies:
 *  - Anonymous callers cannot read any of the three tables.
 *  - Non-admin authenticated users cannot read any of the three tables.
 *  - Admin users CAN read all three tables (when ADMIN_JWT is provided).
 *
 * Skipped by default. To run:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   ADMIN_JWT=<admin-jwt> \
 *   USER_JWT=<non-admin-jwt> \
 *   bunx vitest run src/test/rlsTables.security.test.ts
 */
import { describe, it, expect } from "vitest";

const URL = process.env.SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_JWT = process.env.ADMIN_JWT;
const USER_JWT = process.env.USER_JWT;

const RUN = Boolean(URL && ANON);
const d = RUN ? describe : describe.skip;

const TABLES = ["provider_status", "sync_jobs", "admin_audit_log"] as const;

async function selectRows(table: string, jwt: string | null) {
  const headers: Record<string, string> = { apikey: ANON! };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, { headers });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

d("RLS protection — provider_status / sync_jobs / admin_audit_log", () => {
  for (const table of TABLES) {
    it(`anonymous cannot read ${table}`, async () => {
      const { status, body } = await selectRows(table, null);
      // Either denied (401/403) or empty array (RLS hides every row)
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true);
        expect((body as unknown[]).length).toBe(0);
      } else {
        expect([401, 403, 404]).toContain(status);
      }
    });

    (USER_JWT ? it : it.skip)(`non-admin authenticated cannot read ${table}`, async () => {
      const { status, body } = await selectRows(table, USER_JWT!);
      if (status === 200) {
        expect(Array.isArray(body)).toBe(true);
        expect((body as unknown[]).length).toBe(0);
      } else {
        expect([401, 403, 404]).toContain(status);
      }
    });

    (ADMIN_JWT ? it : it.skip)(`admin can read ${table}`, async () => {
      const { status, body } = await selectRows(table, ADMIN_JWT!);
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  }
});
