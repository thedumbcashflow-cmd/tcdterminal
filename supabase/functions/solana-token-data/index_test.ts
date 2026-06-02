// Tests for solana-token-data edge function.
// Verifies the merged response shape consumed by useTokenCatalyst / TokenCatalyst UI.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertObjectMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/solana-token-data`;
const SOL_MINT = "So11111111111111111111111111111111111111112";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

async function call(body: unknown, method = "POST") {
  const r = await fetch(FN_URL, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: r.status, json, text };
}

Deno.test("rejects non-POST", async () => {
  const { status } = await call(null, "GET");
  assertEquals(status, 405);
});

Deno.test("rejects invalid JSON body", async () => {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: "not-json",
  });
  await r.text();
  assertEquals(r.status, 400);
});

Deno.test("rejects missing/short address", async () => {
  const { status, json } = await call({ address: "abc" });
  assertEquals(status, 400);
  assert(json?.error);
});

Deno.test("returns merged shape for valid mint (SOL)", async () => {
  const { status, json } = await call({ address: SOL_MINT });
  assertEquals(status, 200);
  // top-level keys consumed by useTokenCatalyst.fetchOnChain
  assertObjectMatch(json, {
    mint: {},
    heliusEnabled: json.heliusEnabled,
  });
  assert(Array.isArray(json.holders), "holders is array");
  assert(Array.isArray(json.transfers), "transfers is array");
  assert(Array.isArray(json.defi), "defi is array");
  // mint shape
  assertEquals(json.mint.address, SOL_MINT);
  assert("supply" in json.mint);
  assert("decimals" in json.mint);
  assert("mintAuthority" in json.mint);
  assert("freezeAuthority" in json.mint);
  // errors object so UI can show per-source fallbacks
  assertObjectMatch(json, { errors: {} });
});

Deno.test("holder rows expose UI fields (address, amount, ui_amount)", async () => {
  const { json } = await call({ address: BONK_MINT });
  assert(Array.isArray(json.holders));
  if (json.holders.length > 0) {
    const h = json.holders[0];
    assert(typeof h.address === "string");
    assert("amount" in h);
    assert("ui_amount" in h);
  }
});

Deno.test("second call within TTL serves from cache", async () => {
  await call({ address: SOL_MINT });
  const { json } = await call({ address: SOL_MINT });
  assertEquals(json.cached, true);
});
