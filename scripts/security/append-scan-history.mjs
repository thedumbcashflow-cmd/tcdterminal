#!/usr/bin/env node
/**
 * Appends a single run record to docs/security/scan-history.json so the
 * in-app Admin → Security Trend dashboard can chart severity over time.
 *
 * Usage:
 *   node scripts/security/append-scan-history.mjs \
 *     --high 0 --medium 2 --low 4 --commit $GITHUB_SHA --pr 42 --status pass
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.replace(/^--/, ""), arr[i + 1]]);
    return acc;
  }, []),
);

const HIST = "docs/security/scan-history.json";
let data = { runs: [] };
try {
  data = JSON.parse(readFileSync(HIST, "utf8"));
} catch {
  /* fresh file */
}

const entry = {
  ts: new Date().toISOString(),
  commit: args.commit?.slice(0, 12) ?? null,
  pr: args.pr ? Number(args.pr) : null,
  status: args.status ?? "unknown",
  severity: {
    high: Number(args.high ?? 0),
    medium: Number(args.medium ?? 0),
    low: Number(args.low ?? 0),
  },
};

data.runs = [...(data.runs ?? []), entry].slice(-500); // cap history
writeFileSync(HIST, JSON.stringify(data, null, 2) + "\n");
console.log("Appended scan run:", JSON.stringify(entry));
