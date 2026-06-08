#!/usr/bin/env node
/**
 * Posts a security-scan failure notification to Slack and/or Discord
 * incoming webhooks. Both env vars are optional — only configured channels
 * receive the alert. Exits 0 even if no webhook is set so CI failure stays
 * attributable to the actual scan step, not the notifier.
 *
 * Env: SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL,
 *      REPO, PR, COMMIT, RUN_URL, HIGH_COUNT, NEW_HIGH_COUNT
 */
const {
  SLACK_WEBHOOK_URL,
  DISCORD_WEBHOOK_URL,
  REPO = "unknown/repo",
  PR = "",
  COMMIT = "",
  RUN_URL = "",
  HIGH_COUNT = "0",
  NEW_HIGH_COUNT = "0",
} = process.env;

const high = Number(HIGH_COUNT);
const newHigh = Number(NEW_HIGH_COUNT);
const title = `🚨 Security scan failed — ${newHigh} new / ${high} total high-severity finding(s)`;
const lines = [
  `*Repo:* ${REPO}`,
  PR ? `*PR:* #${PR}` : null,
  COMMIT ? `*Commit:* \`${COMMIT.slice(0, 12)}\`` : null,
  RUN_URL ? `*Run:* ${RUN_URL}` : null,
].filter(Boolean);

const postJson = async (url, payload, label) => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`${label} webhook returned ${res.status}: ${body.slice(0, 200)}`);
    } else {
      console.log(`${label} notification delivered.`);
    }
  } catch (err) {
    console.error(`${label} webhook error: ${err.message}`);
  }
};

const tasks = [];
if (SLACK_WEBHOOK_URL) {
  tasks.push(
    postJson(
      SLACK_WEBHOOK_URL,
      { text: [`*${title}*`, ...lines].join("\n") },
      "Slack",
    ),
  );
}
if (DISCORD_WEBHOOK_URL) {
  tasks.push(
    postJson(
      DISCORD_WEBHOOK_URL,
      {
        username: "Security CI",
        embeds: [
          {
            title,
            color: 0xff3b30,
            description: lines.join("\n").replace(/\*/g, "**"),
          },
        ],
      },
      "Discord",
    ),
  );
}

if (tasks.length === 0) {
  console.log("No webhook secret configured; skipping escalation.");
  process.exit(0);
}
await Promise.all(tasks);
