---
name: Tier Preview Dev Tool
description: Admin-only simulation panel in /admin showing what market_intel rows a user would see at each subscription tier
type: feature
---
A dev/QA tool inside the Admin console at the "Tier Preview" tab. Component: `src/components/admin/TierPreview.tsx`.

Access enforcement (defense-in-depth):
- Tab is rendered only when `role === 'admin'` (NOT moderators).
- Component re-verifies `has_role(uid, 'admin')` server-side on mount.
- Non-admin → toast "Not authorised" + redirect to `/admin`.
- Server-side: `market_intel` RLS uses `get_subscription_tier(auth.uid())` so URL hacking cannot bypass premium row gating.

UI flow:
1. Email/username input + Load User → queries `profiles` by username/display_name.
2. Labelled `<select>` dropdown: "Free user" | "Trial user" | "Pro user". Default = user's actual tier.
3. Live preview table queries `market_intel` with simulated tier filter:
   - `free` → `.eq('is_premium', false)`.
   - `trial` / `pro` → no filter.
4. Paginated 25 rows per page.
5. Reset clears state + sessionStorage.

Session persistence:
- Stored under sessionStorage key `tier_preview_state` ({ email, simTier, userId }).
- Restored on tab revisit; reruns simulation automatically.
- Cleared on Reset button click.

ASSERT (in source comment block):
- GET /admin/tier-preview as role='moderator' → 403 (no render + redirect)
- GET /admin/tier-preview as role='admin'     → 200
