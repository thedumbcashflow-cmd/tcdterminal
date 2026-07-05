// Small pure helper so the Index dashboard's "auto-heal stale Sheet Sync"
// behaviour is testable without mounting the full page.
export interface HealthLike {
  sheetSync?: { ok?: boolean } | null;
}

export type InvokeFn = (name: string) => Promise<unknown>;

/**
 * Returns true if a heal was fired for this session.
 * `alreadyTriggered` prevents repeated invocations on the polling interval.
 */
export function maybeHealSheetSync(
  health: HealthLike | null | undefined,
  invoke: InvokeFn,
  alreadyTriggered: boolean,
): boolean {
  if (alreadyTriggered) return false;
  if (!health) return false;
  const ok = health.sheetSync?.ok === true;
  if (ok) return false;
  // Fire and forget — the caller decides how to swallow errors.
  void invoke("sync-market-data");
  return true;
}
