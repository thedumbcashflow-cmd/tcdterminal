import { defineMcp } from "@lovable.dev/mcp-js";
import getSolanaNetworkStats from "./tools/get-solana-network-stats";
import getProtocolRevenue from "./tools/get-protocol-revenue";
import getTokenPrice from "./tools/get-token-price";

export default defineMcp({
  name: "tcd-terminal-mcp",
  title: "TCD Terminal MCP",
  version: "0.1.0",
  instructions:
    "Read-only market intelligence tools from TCD Terminal. Use `get_solana_network_stats` for live epoch/slot/TPS, `get_protocol_revenue` for top Solana protocols by 24h revenue and fees, and `get_token_price` for the current USD price of any SPL token by mint address.",
  tools: [getSolanaNetworkStats, getProtocolRevenue, getTokenPrice],
});
