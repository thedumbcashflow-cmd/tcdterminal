---
name: Tier Preview Dev Tool
description: Admin-only simulation panel in /admin showing what market_intel rows a user would see at each subscription tier
type: feature
---
A dev/QA tool inside the Admin console at the "Tier Preview" tab. Component: `src/components/admin/TierPreview.tsx`.

Access:
- Tab is rendered only when `role === 'admin'` (NOT moderators).
- Defense-in-depth: the tab content also re-checks `role === 'admin'` before rendering.

UI flow:
1. Email/username input + Load User → queries `profiles` by username/display_name (no email column).
2. Radio buttons: free | trial | pro.
3. Live preview table queries `market_intel` with simulated tier filter:
   - `free` → `.eq('is_premium', false)` (mirrors RLS).
   - `trial` / `pro` → no filter (full read).
4. Paginated 25 rows per page with row count summary.
5. Reset button clears state.
6. Amber banner: "Dev tool — simulation only. No database changes are made."

Important: this is a CLIENT-SIDE simulation. It does not write to the DB or impersonate users. The actual RLS protections remain enforced server-side via `get_subscription_tier(auth.uid())`.
