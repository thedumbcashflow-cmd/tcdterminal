import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SOURCES: Record<string, string> = {
  defi_llama: "https://api.llama.fi",
  gecko_terminal: "https://api.geckoterminal.com",
};

// Simple in-memory cache with 60s TTL (per cold-start instance)
const cache = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60_000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "";
    const endpoint = url.searchParams.get("endpoint") || "";

    if (!SOURCES[source]) {
      return new Response(JSON.stringify({ error: "Invalid source. Use defi_llama or gecko_terminal." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!endpoint || !endpoint.startsWith("/") || endpoint.length > 500) {
      return new Response(JSON.stringify({ error: "Invalid endpoint. Must start with / and be <500 chars." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `${source}:${endpoint}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    const target = SOURCES[source] + endpoint;
    const headers: Record<string, string> = {};
    if (source === "gecko_terminal") headers["Accept"] = "application/json;version=20230302";

    const upstream = await fetch(target, { headers });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      return new Response(JSON.stringify({
        error: `Upstream ${source} returned ${upstream.status}`,
        status: upstream.status,
        detail: body.slice(0, 200),
      }), {
        status: upstream.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    cache.set(cacheKey, { data, expires: Date.now() + TTL_MS });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("data-room-proxy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
