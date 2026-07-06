import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_token_price",
  title: "Get Solana token price",
  description:
    "Look up the current USD price and 24h change for a Solana SPL token by mint address, via Jupiter's public price API.",
  inputSchema: {
    mint: z
      .string()
      .min(32)
      .max(64)
      .describe("Solana SPL token mint address (base58)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ mint }) => {
    try {
      const r = await fetch(`https://api.jup.ag/price/v2?ids=${encodeURIComponent(mint)}`);
      if (!r.ok) throw new Error(`jup ${r.status}`);
      const j = await r.json();
      const entry = j?.data?.[mint];
      if (!entry) {
        return {
          content: [{ type: "text", text: `No price data available for mint ${mint}.` }],
          isError: true,
        };
      }
      const payload = { mint, priceUsd: Number(entry.price), type: entry.type };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to fetch token price: ${String((e as Error).message ?? e)}` }],
        isError: true,
      };
    }
  },
});
