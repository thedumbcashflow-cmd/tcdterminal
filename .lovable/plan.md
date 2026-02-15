

# Token Catalyst Desk (TCD) — Implementation Plan

## Overview
A "Bloomberg for Solana" crypto intelligence terminal with a high-density, institutional-grade Navy/Amber aesthetic. Built on Lovable Cloud (Supabase) with Paystack for South African payment processing. Tiered Free/Pro access enforced at the database level.

---

## Phase 1: Design System & Layout Shell

**Goal:** Establish the "Berg" terminal aesthetic so every subsequent component inherits the correct look.

- Configure Tailwind with custom terminal colors: Navy (#0a0e14), Amber (#FFA028), Terminal Blue (#0068ff)
- Import Google Fonts: **Merriweather** (serif headings) and **JetBrains Mono** (monospace data)
- Override default Shadcn/UI styles: sharp corners (`rounded-none`), compact padding, 1px borders
- Build the main dashboard shell: sidebar navigation, top status bar, and bento-grid content area
- Create reusable **TerminalCard** component with serif title bar and amber border accents

---

## Phase 2: Authentication & User Profiles

**Goal:** Users can sign up, log in, and have a subscription tier tracked in the database.

- Enable Lovable Cloud authentication (Email + Google sign-in)
- Create a **profiles** table linked to auth.users with a `subscription_tier` field (default: `free`)
- Create a **user_roles** table for admin access (following security best practices)
- Style the login/signup flow with the terminal theme — no soft gradients, sharp amber accents
- Auto-create profile on signup via database trigger

---

## Phase 3: Database Schema & Row Level Security

**Goal:** Set up the data tables with strict RLS so free users cannot access premium data.

- Create **market_intel** table (symbol, liquidation_level, whale_flow_score, intel_type, is_premium, created_at)
- Implement RLS policies:
  - Free users: can only read rows where `is_premium = false`
  - Pro users: can read all rows
  - Admin: full read/write access via `has_role()` security definer function
- Verify policies prevent any data leakage at the database level (not frontend gating)

---

## Phase 4: Core Dashboard Widgets

**Goal:** Build the primary data visualization components.

### Whale Flow Table
- High-density data table using TanStack Table
- Compact 28px rows, monospace font, `text-xs`
- Conditional coloring: Buy rows → green, Sell rows → red
- Column filter on Asset, compact pagination
- Real-time Supabase subscription for live row updates

### Liquidation Heatmap
- Built with Recharts
- X-axis: price levels, Y-axis: liquidation volume
- Color gradient from Terminal Blue (low) to Terminal Amber (high)
- Custom dark-themed tooltip
- Gated: blurred with "Terminal Access Restricted" overlay for free users

### REV & Network Health Sparklines
- Sparkline cards showing Real Economic Value, Non-Vote TPS, Stablecoin Velocity
- Each card: metric name (serif), current value (large mono), mini 24h trend line
- Amber/Navy themed

### Live Price Ticker
- Bottom status bar marquee showing SOL, BTC, ETH prices
- Fetched from CoinGecko API every 30 seconds
- Flash green on price up, red on price down, amber at rest

---

## Phase 5: Google Sheets Data Sync

**Goal:** Analysts can input curated intelligence into a Google Sheet that auto-syncs to the database.

- Create a Supabase Edge Function (`sync-market-intel`) that:
  - Fetches CSV from a public Google Sheet URL
  - Parses and upserts into the `market_intel` table
  - Handles errors gracefully
- Schedule via pg_cron to run every 10 minutes
- The Whale Flow Table will display this synced data in real-time

---

## Phase 6: Paystack Payment Integration

**Goal:** Users can upgrade from Free to Pro via Paystack checkout (supporting Credit Card, Apple Pay, Instant EFT).

- Store Paystack Secret Key securely in Lovable Cloud Secrets
- Create an Edge Function to initialize Paystack transactions
- Build a pricing page with Pro tier benefits, styled in terminal aesthetic
- "Upgrade to Pro" button triggers Paystack checkout popup
- On successful payment, Edge Function verifies via Paystack webhook and updates the user's `subscription_tier` to `pro` in the profiles table
- Pro access is immediately reflected via RLS — no frontend-only gating

---

## Phase 7: Pro-Gated "Data Room" Page

**Goal:** A dedicated page for premium analytics, fully locked behind Pro access.

- Contains the Liquidation Heatmap and advanced whale analytics
- If user is Free tier: content is blurred, with a centered "Terminal Access Restricted" modal and upgrade CTA
- RLS ensures the underlying data query returns nothing for free users (defense in depth)

---

## Phase 8: Polish & Responsiveness

**Goal:** Final pass to ensure institutional-grade quality.

- Audit all components for sharp corners, compact spacing, correct fonts
- Ensure the command-line style search bar in the header filters dashboard content
- Mobile responsiveness: stack bento grid vertically, collapse sidebar
- Loading states with terminal-style skeleton animations
- Error states with monospace error messages

