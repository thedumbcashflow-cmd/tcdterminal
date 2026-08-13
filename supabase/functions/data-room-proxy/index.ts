import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true, origin: null as string | null };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCors, "Access-Control-Allow-Origin": origin }, allowed: true, origin };
  }
  return { headers: baseCors, allowed: false, origin };
}

function logCorsDenied(req: Request, origin: string | null) {
  const url = new URL(req.url);
  console.error(JSON.stringify({
    event: "cors_denied",
    origin,
    path: url.pathname,
    timestamp: new Date().toISOString(),
    ip: req.headers.get("x-forwarded-for") ?? "unknown",
  }));
}

const SOURCES: Record<string, string> = {
  defi_llama: "https://api.llama.fi",
  gecko_terminal: "https://api.geckoterminal.com",
};

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60_000;

serve(async (req) => {
  const cors = corsFor(req);

  if (req.method === "OPTIONS") {
    if (!cors.allowed) {
      logCorsDenied(req, cors.origin);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("ok", { headers: cors.headers });
  }
  if (!cors.allowed) {
    logCorsDenied(req, cors.origin);
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const source = url.searchParams.get("source") || "";
    const endpoint = url.searchParams.get("endpoint") || "";

    if (!SOURCES[source]) {
      return new Response(JSON.stringify({ error: "Invalid source. Use defi_llama or gecko_terminal." }), {
        status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }
    if (!endpoint || !endpoint.startsWith("/") || endpoint.length > 500) {
      return new Response(JSON.stringify({ error: "Invalid endpoint. Must start with / and be <500 chars." }), {
        status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `${source}:${endpoint}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...cors.headers, "Content-Type": "application/json", "X-Cache": "HIT" },
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
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    cache.set(cacheKey, { data, expires: Date.now() + TTL_MS });

    return new Response(JSON.stringify(data), {
      headers: { ...cors.headers, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("data-room-proxy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }
});
