import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest, ALLOWED_METHODS, _resetBreakers, _breakerState, callWithFallback } from "./handler.ts";

const origin = "http://localhost:5173";
const post = (body: unknown) =>
  new Request("http://localhost/solana-rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": origin },
    body: JSON.stringify(body),
  });

Deno.test("allow-list contains expected methods", () => {
  for (const m of ["getEpochInfo", "getVoteAccounts", "getRecentPerformanceSamples", "getSlot", "getHealth", "getBlockHeight"]) {
    assert(ALLOWED_METHODS.has(m), `${m} should be allow-listed`);
  }
});

Deno.test("rejects non-allow-listed method with 400", async () => {
  const res = await handleRequest(post({ method: "getBalance", params: [] }));
  assertEquals(res.status, 400);
  const j = await res.json();
  assert(String(j.error).includes("Method not allowed"));
});

Deno.test("rejects invalid JSON with 400", async () => {
  const req = new Request("http://localhost/solana-rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": origin },
    body: "{not json",
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 400);
});

Deno.test("rejects unauthorized origin", async () => {
  const req = new Request("http://localhost/solana-rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://evil.com" },
    body: JSON.stringify({ method: "getSlot" }),
  });
  const res = await handleRequest(req);
  assertEquals(res.status, 403);
});

Deno.test("OPTIONS preflight from allowed origin returns CORS headers", async () => {
  const req = new Request("http://localhost/solana-rpc", { method: "OPTIONS", headers: { "Origin": origin } });
  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
  await res.body?.cancel();
});

Deno.test("circuit breaker trips after 5 failures", async () => {
  _resetBreakers();
  const origFetch = globalThis.fetch;
  // Force every endpoint to fail
  globalThis.fetch = () => Promise.reject(new Error("boom"));
  try {
    // one call = 3 retries per endpoint. Two endpoints → 6 fails on each? No: each callWithFallback runs each endpoint's 3 retries then counts ONE recordFailure per endpoint. So it takes 5 top-level calls to trip.
    for (let i = 0; i < 5; i++) {
      try { await callWithFallback("getSlot", []); } catch { /* expected */ }
    }
    const b = _breakerState("publicnode");
    assert(b, "publicnode breaker state should exist");
    assert(b!.openUntil > Date.now(), "publicnode circuit should be OPEN");
  } finally {
    globalThis.fetch = origFetch;
    _resetBreakers();
  }
});
