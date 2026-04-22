# Memory: index.md
Updated: just now

# Project Memory

## Core
- "Berg" System: High density, bento-box grid, 1px solid borders, no rounded corners.
- Colors: Navy (#0a0e14), Amber (#FFA028), Terminal Blue (#0068ff).
- Fonts: Merriweather for headings, JetBrains Mono for tabular/numerical data.
- Routing: Public landing at `/`, authenticated terminal at `/dashboard` protected by AuthGuard.
- Real data only: Always use institutional-grade values (e.g., 'Wintermute'). Never use mock placeholders.
- Tech Stack: Supabase with RLS, PayPal (JS SDK v5, no Paystack), Lovable Cloud OAuth.
- Admin bypass: Global bypass for `thedumbcashflow@gmail.com` via `user_roles`.
- Code Hygiene: Explicit null guards, fix `forwardRef` warnings, use `.maybeSingle()` for empty rows.
- Edge Function CORS: strict allowlist (tcdterminal.lovable.app, id-preview lovable URL, localhost:3000/5173). No wildcards.

## Memories
- [Terminal Aesthetic](mem://design/terminal-aesthetic) — Berg system design tokens, high-density bento grid rules
- [Subscription Tiers](mem://auth/subscription-tiers) — Statuses: trial, pro, whale, expired; role-based RLS
- [Social Sign-In](mem://auth/social-sign-in) — Google and Apple OAuth only via Lovable Cloud
- [Pipeline Architecture](mem://data/pipeline-architecture) — Hybrid Google Sheets sync, Bitquery GraphQL, Solana WebSockets
- [Solana Intelligence](mem://features/solana-intelligence) — Helius API, REV, non-vote TPS, health indicator thresholds
- [Security Architecture](mem://tech/security-architecture) — RBAC user_roles, RLS policies, realtime premium channel gating
- [AI Integration](mem://tech/ai-integration) — Gemini-3-flash-preview, SSE streaming, Supabase edge functions
- [Premium Gating UI](mem://features/premium-gating-ui) — Blur backdrop, modal redirects to Pricing preserving context
- [Management Console](mem://admin/management-console) — Role-gated admin CRUD, system health monitoring
- [Quality Standards](mem://data/quality-standards) — Mandate for realistic institutional data instead of mocks
- [AI Chatbot](mem://features/ai-chatbot) — Persistent authenticated bubble grounded in live terminal data
- [Mobile Responsiveness](mem://design/mobile-responsiveness) — 390px viewport target, horizontal scrolling for high-density tables
- [Feature Requests](mem://admin/feature-requests) — Pro/Whale only submission, admin panel queue
- [PayPal Integration](mem://payments/paypal-integration) — JS SDK v5 checkout, idempotency checks, server-side capture
- [Pricing Structure](mem://payments/pricing-structure) — Pro ($199/mo) and Whale ($799/mo) with quarterly/yearly discounts
- [User Settings](mem://features/user-settings) — Display name, timezone persistence with safe initial defaults
- [World Monitor](mem://features/world-monitor) — AGPL v3 component, Fear/Greed, BTC dominance, Dollar Index
- [Performance Optimization](mem://tech/performance-optimization) — Query deduplication, tiered caching TTLs, lazy-loading
- [User Interactions](mem://features/user-interactions) — Saved notes and pinned assets (Pro/Whale) in user_item_notes
- [App Hierarchy](mem://routing/app-hierarchy) — Root public marketing vs authenticated dashboard routing architecture
- [Trial System](mem://payments/trial-system) — 14-day Pro trial with nightly cron expiration to expired status
- [Pricing Page Layout](mem://design/pricing-page-layout) — Banner for trial, specific tier card details, billing toggle
- [Component Hygiene](mem://tech/component-hygiene) — React StrictMode purity, null guards, resolving console warnings
- [Watchlist Limit](mem://features/watchlist-limit) — 5 item max for free/trial users via database triggers
- [Data Room Analytics](mem://features/data-room-analytics) — Deep-dive DeFiLlama/GeckoTerminal data for Pro/Whale
- [Edge Function CORS](mem://tech/edge-function-cors) — Strict origin allowlist across all edge functions, no wildcards
- [Tier Preview Tool](mem://admin/tier-preview-tool) — Admin-only RLS simulation panel in /admin
