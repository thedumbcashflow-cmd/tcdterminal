#!/usr/bin/env node
/**
 * Lightweight APILayer smoke test for CI.
 * Pings a couple of common APILayer endpoints and accepts the first that
 * authenticates with APILAYER_KEY (key is provisioned per-product, so we
 * don't assume which product is enabled). Validates the response is JSON
 * and contains a recognizable shape.
 *
 * Exits 0 on success, non-zero if every endpoint fails or APILAYER_KEY is
 * missing.
 */
const KEY = process.env.APILAYER_KEY;
if (!KEY) {
  console.error("APILAYER_KEY is not set — skipping smoke test (failing closed in CI).");
  process.exit(1);
}

const ENDPOINTS = [
  {
    name: "exchangerates_data/latest",
    url: "https://api.apilayer.com/exchangerates_data/latest?base=USD&symbols=EUR",
    validate: (j) => j && j.success !== false && (j.rates?.EUR != null || j.base === "USD"),
  },
  {
    name: "currency_data/live",
    url: "https://api.apilayer.com/currency_data/live?source=USD&currencies=EUR",
    validate: (j) => j && j.success !== false && j.quotes && Object.keys(j.quotes).length > 0,
  },
  {
    name: "fixer/latest",
    url: "https://api.apilayer.com/fixer/latest?base=USD&symbols=EUR",
    validate: (j) => j && j.success !== false && j.rates?.EUR != null,
  },
];

let lastErr = null;
for (const ep of ENDPOINTS) {
  try {
    const res = await fetch(ep.url, { headers: { apikey: KEY } });
    const body = await res.text();
    if (!res.ok) {
      lastErr = `${ep.name} → HTTP ${res.status}: ${body.slice(0, 160)}`;
      console.log(`✗ ${lastErr}`);
      continue;
    }
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      lastErr = `${ep.name} → non-JSON response`;
      console.log(`✗ ${lastErr}`);
      continue;
    }
    if (!ep.validate(json)) {
      lastErr = `${ep.name} → schema validation failed: ${JSON.stringify(json).slice(0, 200)}`;
      console.log(`✗ ${lastErr}`);
      continue;
    }
    console.log(`✓ APILayer smoke OK via ${ep.name}`);
    process.exit(0);
  } catch (err) {
    lastErr = `${ep.name} → ${err.message}`;
    console.log(`✗ ${lastErr}`);
  }
}

console.error(`APILayer smoke test failed for every endpoint. Last error: ${lastErr}`);
process.exit(1);
