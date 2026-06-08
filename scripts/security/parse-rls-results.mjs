#!/usr/bin/env node
/**
 * Parses a vitest JSON reporter file from RLS security tests and emits:
 *   - rls-summary.md  (Markdown table for PR comments)
 *   - rls-summary.json (machine-readable, kept as CI artifact)
 *
 * Usage: node scripts/security/parse-rls-results.mjs <vitest-json> <out-dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , inputPath, outDir = "."] = process.argv;
if (!inputPath) {
  console.error("usage: parse-rls-results.mjs <vitest-json> [out-dir]");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (err) {
  console.error(`Failed to read vitest JSON at ${inputPath}: ${err.message}`);
  // Emit empty summary so the PR comment step still works.
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rls-summary.md"), "_No RLS results captured._\n");
  writeFileSync(resolve(outDir, "rls-summary.json"), JSON.stringify({ rows: [], totals: { passed: 0, failed: 0, skipped: 0 } }, null, 2));
  process.exit(0);
}

const rows = [];
const totals = { passed: 0, failed: 0, skipped: 0 };

const collect = (suite, parents = []) => {
  const name = suite.name ?? "";
  const trail = name ? [...parents, name] : parents;
  for (const t of suite.tasks ?? []) {
    if (t.type === "suite") {
      collect(t, trail);
    } else {
      const state = t.result?.state ?? t.mode ?? "skipped";
      const status =
        state === "pass" ? "passed" : state === "fail" ? "failed" : "skipped";
      totals[status]++;
      rows.push({
        policy: trail.join(" › ") || "(root)",
        test: t.name,
        status,
        duration_ms: Math.round(t.result?.duration ?? 0),
        error: t.result?.errors?.[0]?.message?.slice(0, 240) ?? null,
      });
    }
  }
};

for (const f of report.files ?? report.testResults ?? []) collect(f);

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "rls-summary.json"), JSON.stringify({ rows, totals }, null, 2));

const icon = (s) => (s === "passed" ? "✅" : s === "failed" ? "❌" : "⏭️");
const md = [
  `### 🛡️ RLS Verification — ${totals.passed} passed · ${totals.failed} failed · ${totals.skipped} skipped`,
  "",
  "| Status | Policy / Suite | Test | Duration | Error |",
  "|---|---|---|---:|---|",
  ...rows.map(
    (r) =>
      `| ${icon(r.status)} ${r.status} | ${r.policy} | ${r.test} | ${r.duration_ms} ms | ${r.error ? "`" + r.error.replace(/\|/g, "\\|") + "`" : ""} |`,
  ),
].join("\n");

writeFileSync(resolve(outDir, "rls-summary.md"), md + "\n");
console.log(md);

if (totals.failed > 0) process.exit(1);
