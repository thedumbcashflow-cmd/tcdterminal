# RLS Policies, Triggers & Audit Log

> Reference for the Supabase security model behind TCD Terminal.
> **Do not modify policies on `user_roles`, `market_intel`, or `admin_audit_log` without reading this file first.**

---

## 1. `user_roles` — Source of Truth for Access Control

Roles enum: `admin`, `moderator`, `user`. Stored in `public.user_roles (user_id, role)` (UNIQUE pair).

### Policies (in evaluation order)

| Policy | Cmd | Type | Effect |
|---|---|---|---|
| `Restrict role inserts to admins only` | INSERT | **RESTRICTIVE** | Hard floor: only callers where `has_role(auth.uid(),'admin')` may insert. |
| `Admins can insert roles` | INSERT | PERMISSIVE | Admin convenience grant. |
| `Restrict role deletes to admins only` | DELETE | **RESTRICTIVE** | Hard floor: only admins may delete. |
| `Admins can delete roles` | DELETE | PERMISSIVE | Admin convenience grant. |
| `No one can update roles` | UPDATE | **RESTRICTIVE** | Hard `false` — roles are immutable; revoke + re-insert instead. |
| `Admins can read all roles` | SELECT | PERMISSIVE | Admin visibility. |
| `Moderators can read all roles` | SELECT | PERMISSIVE | Mod visibility (read only). |
| `Users can read own roles` | SELECT | PERMISSIVE | Each user can see their own role list. |

### Why two layers (RESTRICTIVE + PERMISSIVE)

Postgres RLS evaluates **all** RESTRICTIVE policies as `AND` and any PERMISSIVE policy as `OR`. Even if a future migration accidentally adds a permissive policy that allows non-admins, the RESTRICTIVE layer will still block them. **Never remove the RESTRICTIVE policies.**

### Triggers

- `trg_audit_user_roles` (AFTER INSERT/DELETE) → `audit_user_roles()` writes to `admin_audit_log`.

---

## 2. `market_intel` — Tier-Gated Data

### Policies

| Policy | Cmd | Effect |
|---|---|---|
| `Authenticated users can read market intel based on tier` | SELECT | Free users see only `is_premium = false`. Pro/Whale and admins see all. |
| `Admins can manage market intel` | ALL | Full CRUD for admins. |
| `Moderators can manage market intel` | ALL | Full CRUD for moderators. |

### Realtime gating

Free-tier subscribers must filter `is_premium=eq.false` on the channel. Premium topics use the gated `premium:%` topic prefix; only Pro/Whale clients are issued tokens that match. RLS still backs this on the table itself.

### Triggers

- `trg_audit_market_intel` (AFTER INSERT/UPDATE/DELETE) → `audit_market_intel()` records premium-flag and intel-type changes.

---

## 3. `admin_audit_log` — Append-Only Forensics

Schema: `id, created_at, actor_user_id, action, target_table, target_id, old_values jsonb, new_values jsonb`.

### Policies

| Policy | Cmd | Effect |
|---|---|---|
| `Admins can read audit log` | SELECT | Admins only. |
| `Block client writes audit log` | ALL (RESTRICTIVE) | Hard `false` — clients can never INSERT/UPDATE/DELETE. Triggers (SECURITY DEFINER) are the only writers. |

### Recorded actions

- `role_grant`, `role_revoke` (from `user_roles`)
- `intel_create`, `intel_topic_change`, `intel_delete` (from `market_intel`)

---

## 4. Helper Functions

### `has_role(_user_id uuid, _role app_role) → boolean`

- `SECURITY DEFINER`, `STABLE`, `search_path = public`.
- **Hardened**: returns `false` when either argument is NULL. Prevents NULL-bypass in policies that depend on it.
- EXECUTE is revoked from `PUBLIC, anon, authenticated` — only invoked through RLS expressions and triggers, never via PostgREST RPC.

### `get_subscription_tier(_user_id uuid) → subscription_tier`

- `SECURITY DEFINER`, EXECUTE locked down. Used inside RLS expressions on tier-gated tables.

### `prevent_tier_self_modification()` (trigger on `profiles`)

- Blocks users from changing their own `subscription_tier` or `trial_ends_at`. Service role (auth.uid() is NULL) bypasses.

### `enforce_watchlist_limit()` (trigger on `user_watchlist`)

- Caps free users at 5 watchlist items.

### `test_user_roles_protection() → setof (test_name, passed, detail)`

- Admin-only smoke test. Verifies RESTRICTIVE policies, NULL-safety of `has_role`, audit triggers, and creator's admin role.
- Run from SQL editor: `SELECT * FROM public.test_user_roles_protection();`

---

## 5. Change-Management Checklist

Before merging any migration that touches `user_roles`, `market_intel`, `admin_audit_log`, or `has_role`:

1. ☐ All RESTRICTIVE policies on `user_roles` still present (INSERT/UPDATE/DELETE).
2. ☐ `has_role` retains its NULL guard.
3. ☐ EXECUTE on SECURITY DEFINER helpers remains revoked from `PUBLIC, anon, authenticated`.
4. ☐ Audit triggers `trg_audit_user_roles` and `trg_audit_market_intel` still attached.
5. ☐ Run `SELECT * FROM public.test_user_roles_protection();` as an admin — every row must be `passed=true`.
6. ☐ Run `bunx vitest run src/test/userRoles.security.test.ts`.
