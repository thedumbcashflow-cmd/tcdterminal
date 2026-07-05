import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { maybeHealSheetSync } from "@/lib/sheetSyncHealer";

describe("maybeHealSheetSync", () => {
  it("fires sync-market-data when sheetSync is not ok", () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    const fired = maybeHealSheetSync({ sheetSync: { ok: false } }, invoke, false);
    expect(fired).toBe(true);
    expect(invoke).toHaveBeenCalledWith("sync-market-data");
  });

  it("does not fire when sheetSync is ok", () => {
    const invoke = vi.fn();
    expect(maybeHealSheetSync({ sheetSync: { ok: true } }, invoke, false)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not fire twice in the same session", () => {
    const invoke = vi.fn();
    expect(maybeHealSheetSync({ sheetSync: { ok: false } }, invoke, true)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("handles missing sheetSync gracefully", () => {
    const invoke = vi.fn();
    expect(maybeHealSheetSync({}, invoke, false)).toBe(true);
    expect(maybeHealSheetSync(null, invoke, false)).toBe(false);
  });
});

describe("defiLlama revenue mapping", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("maps the current DefiLlama shape (total24h → dailyRevenue) and merges fees", async () => {
    const revPayload = {
      total24h: 1_000_000,
      protocols: [
        { name: "Raydium", total24h: 500_000, total7d: 3_000_000, change_1d: 12.3, category: "Dexs", logo: "r.png" },
        { name: "Orca",    total24h: 250_000, total7d: 1_500_000, change_1d: -4.5, category: "Dexs", logo: "o.png" },
        { name: "Zero",    total24h: 0,       total7d: 0,         change_1d: 0,    category: "Dexs", logo: "" },
      ],
    };
    const feesPayload = {
      protocols: [
        { name: "Raydium", total24h: 800_000 },
        { name: "Orca",    total24h: 400_000 },
      ],
    };
    globalThis.fetch = vi.fn(async (url: any) => {
      const s = String(url);
      const body = s.includes("dailyFees") ? feesPayload : revPayload;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as any;

    const { fetchSolanaProtocolRevenue } = await import("@/services/defiLlama");
    const out = await fetchSolanaProtocolRevenue();
    expect(out.totalDailyRevenue).toBe(1_000_000);
    expect(out.protocols).toHaveLength(2); // Zero filtered out
    expect(out.protocols[0]).toMatchObject({
      name: "Raydium",
      dailyRevenue: 500_000,
      dailyFees: 800_000,
      total7dRevenue: 3_000_000,
      change_1d: 12.3,
    });
    expect(out.protocols[1].name).toBe("Orca");
    expect(out.protocols[1].dailyFees).toBe(400_000);
  });

  it("falls back to revenue as fees when the fees endpoint fails", async () => {
    globalThis.fetch = vi.fn(async (url: any) => {
      if (String(url).includes("dailyFees")) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({
        total24h: 100,
        protocols: [{ name: "Solo", total24h: 42, total7d: 300, change_1d: null, category: "Dexs", logo: "" }],
      }), { status: 200 });
    }) as any;

    const { fetchSolanaProtocolRevenue } = await import("@/services/defiLlama");
    const out = await fetchSolanaProtocolRevenue();
    expect(out.protocols[0].dailyRevenue).toBe(42);
    expect(out.protocols[0].dailyFees).toBe(42); // fallback to revenue
  });
});
