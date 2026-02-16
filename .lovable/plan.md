

# Phase 2 + 3: Authentication, Database Schema & Dashboard Polish

## Overview
Set up the full backend infrastructure (authentication, profiles, user roles, market intel table) with strict Row Level Security, then build a terminal-themed auth flow and refine the dashboard layout.

---

## Database Migration (Single SQL Migration)

Create all tables, enums, functions, triggers, and RLS policies in one migration:

### Tables & Types
1. **`app_role` enum** -- values: `admin`, `moderator`, `user`
2. **`subscription_tier` enum** -- values: `free`, `pro`, `whale`
3. **`profiles` table** -- linked to `auth.users(id)` with `ON DELETE CASCADE`
   - `id` (uuid, PK, references auth.users)
   - `username` (text, nullable)
   - `avatar_url` (text, nullable)
   - `subscription_tier` (subscription_tier, default `free`)
   - `created_at`, `updated_at` (timestamptz)
4. **`user_roles` table** -- separate table for roles (security best practice)
   - `id` (uuid, PK)
   - `user_id` (uuid, references auth.users, NOT NULL)
   - `role` (app_role, NOT NULL)
   - unique constraint on (user_id, role)
5. **`market_intel` table** -- the core data table
   - `id` (uuid, PK)
   - `asset_symbol` (text, NOT NULL)
   - `flow_type` (text) -- BUY/SELL
   - `value_usd` (numeric)
   - `wallet_label` (text)
   - `liquidation_level` (numeric)
   - `whale_flow_score` (numeric)
   - `intel_type` (text)
   - `is_premium` (boolean, default false)
   - `created_at` (timestamptz)

### Security Definer Function
- `has_role(uuid, app_role)` -- checks user_roles without recursive RLS

### Database Trigger
- Auto-create a `profiles` row with `subscription_tier = 'free'` when a new user signs up via `auth.users`

### RLS Policies

**profiles table:**
- Users can read their own profile
- Users can update their own profile (username, avatar_url only)

**user_roles table:**
- RLS enabled, no public policies (only accessible via `has_role()` security definer)

**market_intel table (the critical tier-gating):**
- `SELECT` for authenticated users: rows where `is_premium = false`
- `SELECT` for pro/whale users: all rows (checked via a `get_subscription_tier()` security definer function that reads the user's profile)
- Combined into a single policy: `is_premium = false OR get_subscription_tier(auth.uid()) IN ('pro', 'whale')`
- `INSERT/UPDATE/DELETE` restricted to admins via `has_role()`

### Realtime
- Enable realtime on `market_intel` for live table updates

---

## Authentication UI

### New Files
1. **`src/pages/Auth.tsx`** -- Terminal-themed login/signup page
   - Email + password sign-in and sign-up forms
   - Google OAuth via `lovable.auth.signInWithOAuth("google")`
   - Navy/Amber aesthetic: sharp borders, monospace inputs, no rounded corners
   - Toggle between "SIGN IN" and "CREATE ACCOUNT" modes
   - Error/success toast messages
   - Redirects to dashboard on successful auth

2. **`src/hooks/useAuth.ts`** -- Auth state hook
   - Wraps `supabase.auth.onAuthStateChange` and `getSession`
   - Provides `user`, `session`, `loading`, `signOut` 
   - Used by layout components to show/hide auth-gated content

3. **`src/components/AuthGuard.tsx`** -- Route protection wrapper
   - If not authenticated, redirect to `/auth`
   - If loading, show terminal-style loading skeleton

### Modified Files
4. **`src/App.tsx`** -- Add `/auth` route, wrap dashboard in `AuthGuard`
5. **`src/components/TopBar.tsx`** -- Add user indicator (username or email) and sign-out button in top-right
6. **`src/components/TerminalSidebar.tsx`** -- Show subscription tier badge (FREE/PRO) below the logo

---

## Dashboard Layout Polish

### Changes to `src/pages/Index.tsx`
- Make metric row responsive: `grid-cols-2 md:grid-cols-4`
- Make bento grid responsive: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Add more mock rows to the Whale Flow table (12 rows instead of 8)
- Add a mini sparkline visual (CSS-only bar chart) inside the Network Health widget
- Tighten spacing: reduce gap from `gap-2` to `gap-1.5` in the bento grid for higher density
- Add "PRO" lock overlay on the Liquidation Zones and Data Room sidebar items (already partially done with the lock icon)

---

## Technical Sequence

```text
1. Run SQL migration (tables, enums, functions, triggers, RLS)
2. Configure Google OAuth via social login tool
3. Create useAuth hook
4. Create Auth page (/auth)
5. Create AuthGuard component
6. Update App.tsx with routes
7. Update TopBar with user info + sign out
8. Update TerminalSidebar with tier badge
9. Polish Index.tsx layout (responsive grid, more data rows)
```

---

## Security Summary
- Roles stored in separate `user_roles` table (never on profiles)
- `has_role()` security definer prevents recursive RLS
- `market_intel` premium data gated at database level via RLS -- free users physically cannot fetch premium rows
- No frontend-only gating; the blur overlay is cosmetic defense-in-depth on top of real RLS
- Admin status checked via `has_role()`, never localStorage

