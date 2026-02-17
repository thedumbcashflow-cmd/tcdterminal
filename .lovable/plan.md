

# Phase 4 + AI Analysis: Data Widgets, AI Edge Function & Auth Testing

## Overview
Build the core data visualization layer with real database queries, create an AI-powered market analysis edge function, and wire everything together with the terminal aesthetic.

---

## 1. AI Market Analysis Edge Function

**File: `supabase/functions/analyze-market/index.ts`**

- Accepts POST with optional `asset_symbol` filter
- Queries `market_intel` table using service role key for full data access
- Sends whale flow data to Lovable AI Gateway (`google/gemini-3-flash-preview`) with a system prompt: "You are an institutional-grade Solana market analyst. Summarize whale flow patterns, identify accumulation/distribution trends, and flag notable wallet activity."
- Returns streaming SSE response for real-time token rendering
- Handles 429/402 rate limit errors gracefully
- Requires auth token (validates user session) but uses service role for DB read

**Config update: `supabase/config.toml`**
```toml
[functions.analyze-market]
verify_jwt = false
```

---

## 2. Whale Flow Table (Real DB Data)

**New file: `src/components/WhaleFlowTable.tsx`**

- Fetches from `market_intel` table via Supabase client (RLS auto-filters by tier)
- Subscribes to Supabase Realtime channel for live row insertions
- Columns: Time, Asset, Type (BUY/SELL), Value, Label, Score
- Conditional row coloring: green tint for BUY, red tint for SELL
- Compact 28px rows, `font-data text-xs`
- Falls back to mock data if no DB rows exist yet
- Includes an "AI Analysis" button in the TerminalCard header that triggers the edge function and displays the streaming summary in a collapsible panel below the table

---

## 3. Liquidation Heatmap (Recharts)

**New file: `src/components/LiquidationHeatmap.tsx`**

- Uses Recharts `BarChart` with custom gradient bars
- X-axis: price levels, Y-axis: liquidation volume in USD
- Color gradient from Terminal Blue (low volume) to Amber (high volume)
- Custom dark-themed tooltip matching the terminal aesthetic
- Data sourced from `market_intel` rows where `liquidation_level IS NOT NULL`
- **Pro gating**: For free-tier users, render a blurred overlay with "TERMINAL ACCESS RESTRICTED" and an upgrade CTA button
- Uses the `useAuth` hook + profile query to determine tier

---

## 4. Live Price Ticker (CoinGecko API)

**New file: `supabase/functions/fetch-prices/index.ts`**

- Edge function that calls CoinGecko free API (`/api/v3/simple/price`)
- Fetches SOL, BTC, ETH, JUP, BONK, RAY with USD prices and 24h change
- Returns JSON array of ticker items
- No auth required (public endpoint)

**Config update:**
```toml
[functions.fetch-prices]
verify_jwt = false
```

**Updated: `src/components/LiveTicker.tsx`**
- Calls `fetch-prices` edge function every 30 seconds
- Falls back to mock data on error
- Flash animation: green pulse on price increase, red on decrease, amber at rest
- Keeps the existing scrolling marquee animation

---

## 5. Dashboard Integration

**Updated: `src/pages/Index.tsx`**
- Replace mock whale flow table with `WhaleFlowTable` component
- Replace static liquidation bars with `LiquidationHeatmap` component
- Keep metric cards as-is (will be wired to real APIs in a future phase)
- Add "AI ANALYSIS" button in the Whale Flow card header

---

## 6. Supporting Hooks & Utilities

**New file: `src/hooks/useSubscriptionTier.ts`**
- Queries the user's profile for `subscription_tier`
- Returns `{ tier, loading, isPro }` for easy gating checks
- Used by LiquidationHeatmap and other pro-gated components

**New file: `src/hooks/useMarketIntel.ts`**
- Fetches `market_intel` data with Supabase client
- Sets up Realtime subscription for live updates
- Returns `{ data, loading, error }`

---

## 7. Auth Flow Testing Checklist

After implementation, we will manually verify:
- Sign up with email at `/auth` -- confirm "Check your email" toast appears
- Attempt sign in before verification -- confirm auth error
- Verify email via link -- confirm redirect works
- Sign in with verified account -- confirm dashboard loads
- Confirm FREE badge visible in sidebar
- Confirm Whale Flow table loads (mock or real data)
- Confirm Liquidation Heatmap shows blur overlay for free tier
- Confirm sign out returns to `/auth`
- Confirm Google OAuth button initiates flow

---

## Technical Sequence

```text
1. Create useSubscriptionTier hook
2. Create useMarketIntel hook  
3. Create analyze-market edge function + config.toml update
4. Create fetch-prices edge function + config.toml update
5. Create WhaleFlowTable component (with AI analysis panel)
6. Create LiquidationHeatmap component (with pro gate)
7. Update LiveTicker to use fetch-prices edge function
8. Update Index.tsx to use new components
9. Test auth flow end-to-end
```

---

## Files Created
- `supabase/functions/analyze-market/index.ts`
- `supabase/functions/fetch-prices/index.ts`
- `src/hooks/useSubscriptionTier.ts`
- `src/hooks/useMarketIntel.ts`
- `src/components/WhaleFlowTable.tsx`
- `src/components/LiquidationHeatmap.tsx`

## Files Modified
- `supabase/config.toml` (add function configs)
- `src/components/LiveTicker.tsx` (wire to edge function)
- `src/pages/Index.tsx` (swap in real components)
