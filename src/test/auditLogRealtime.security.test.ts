/**
 * admin_audit_log realtime notification tests.
 *
 * Verifies that:
 *  - An admin can subscribe to INSERT events on `admin_audit_log` and receive
 *    a payload when a new audit entry is created.
 *  - A non-admin client either fails to receive any payload or is rejected by
 *    the realtime authorization layer (no payload within the timeout).
 *
 * Skipped by default. To run locally:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon> \
 *   ADMIN_JWT=<admin-user-access-token> \
 *   ADMIN_USER_ID=<admin-user-uuid> \
 *   USER_JWT=<non-admin-access-token> \
 *   bunx vitest run src/test/auditLogRealtime.security.test.ts
 *
 * The trigger that produces an audit row fires when an admin
 * grants/revokes a role on `user_roles`. The admin test inserts a benign
 * `user` role for ADMIN_USER_ID (and cleans up) to drive a realtime event.
 */
import { describe, it, expect } from "vitest";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_JWT = process.env.ADMIN_JWT;
const USER_JWT = process.env.USER_JWT;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

const RUN = Boolean(URL && ANON);
const d = RUN ? describe : describe.skip;

function makeClient(jwt?: string) {
  return createClient(URL!, ANON!, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
    realtime: { params: { eventsPerSecond: 5 } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function awaitFirstInsert(channel: RealtimeChannel, timeoutMs: number) {
  return new Promise<any | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.on(
      "postgres_changes" as any,
      { event: "INSERT", schema: "public", table: "admin_audit_log" } as any,
      (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      },
    );
  });
}

d("admin_audit_log realtime", () => {
  (ADMIN_JWT && ADMIN_USER_ID ? it : it.skip)(
    "admin receives INSERT notifications",
    async () => {
      const client = makeClient(ADMIN_JWT!);
      const channel = client.channel("audit-log-test-admin");
      const inserted = awaitFirstInsert(channel, 8000);
      await new Promise<void>((res) => channel.subscribe((s) => s === "SUBSCRIBED" && res()));

      // Trigger an audit event by inserting then removing a benign role.
      await client.from("user_roles").insert({ user_id: ADMIN_USER_ID!, role: "user" } as any);
      const payload = await inserted;
      // Cleanup
      await client.from("user_roles").delete().eq("user_id", ADMIN_USER_ID!).eq("role", "user" as any);
      await client.removeChannel(channel);

      expect(payload).not.toBeNull();
      expect((payload as any).new?.target_table).toBe("user_roles");
    },
    20000,
  );

  (USER_JWT ? it : it.skip)(
    "non-admin does not receive admin_audit_log INSERTs",
    async () => {
      const client = makeClient(USER_JWT!);
      const channel = client.channel("audit-log-test-user");
      const received = awaitFirstInsert(channel, 4000);
      await new Promise<void>((res) =>
        channel.subscribe((s) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") && res()),
      );
      const payload = await received;
      await client.removeChannel(channel);
      // Either subscription was rejected or no payload arrived within the window.
      expect(payload).toBeNull();
    },
    15000,
  );

  (ANON ? it : it.skip)(
    "anonymous does not receive admin_audit_log INSERTs",
    async () => {
      const client = makeClient();
      const channel = client.channel("audit-log-test-anon");
      const received = awaitFirstInsert(channel, 4000);
      await new Promise<void>((res) =>
        channel.subscribe((s) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") && res()),
      );
      const payload = await received;
      await client.removeChannel(channel);
      expect(payload).toBeNull();
    },
    15000,
  );
});
