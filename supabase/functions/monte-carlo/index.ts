// Monte Carlo simulator — runs IRR distribution on the server so the UI never
// blocks. Normal(baseIrr, stdDev) via Box-Muller, returns percentiles + 20-bin
// histogram. Auth required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randNorm(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) return json(401, { error: "Unauthorized" });

  let body: { baseIrr?: number; stdDev?: number; simulations?: number };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const baseIrr = Number(body.baseIrr);
  const stdDev = Number(body.stdDev);
  const simulations = Math.min(50_000, Math.max(100, Math.floor(Number(body.simulations) || 5000)));
  if (!isFinite(baseIrr) || !isFinite(stdDev) || stdDev < 0) {
    return json(400, { error: "Invalid parameters: baseIrr, stdDev, simulations required" });
  }

  const t0 = Date.now();
  const results = new Float64Array(simulations);
  for (let k = 0; k < simulations; k++) results[k] = baseIrr + randNorm() * stdDev;
  const sorted = Array.from(results).sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.floor(q * (simulations - 1))];

  const min = sorted[0], max = sorted[simulations - 1];
  const bucketCount = 20;
  const width = (max - min) / bucketCount || 1;
  const bins = new Array(bucketCount).fill(0);
  const binEdges = new Array(bucketCount + 1).fill(0).map((_, i) => min + i * width);
  for (const x of sorted) {
    const idx = Math.min(bucketCount - 1, Math.floor((x - min) / width));
    bins[idx]++;
  }
  const mean = sorted.reduce((a, b) => a + b, 0) / simulations;

  return json(200, {
    simulations,
    p10: p(0.1), p50: p(0.5), p90: p(0.9),
    mean, min, max,
    bins, binEdges,
    elapsedMs: Date.now() - t0,
  });
});
