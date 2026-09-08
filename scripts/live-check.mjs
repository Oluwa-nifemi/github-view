import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

// The credential stays in memory and the isolated browser is destroyed afterward.
const token = execFileSync("gh", ["auth", "token"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.APP_URL || "http://127.0.0.1:4173");
  await page.getByLabel("GitHub token", { exact: true }).fill(token);
  await page
    .getByRole("button", { name: "Save and load", exact: true })
    .click();
  await page.waitForFunction(
    () => {
      const snapshot = localStorage.getItem("gh_digest_last_snapshot");
      const error = document.querySelector('[role="alert"]');
      return snapshot || error?.textContent;
    },
    null,
    { timeout: 180000 },
  );
  const result = await page.evaluate(() => {
    const snapshot = JSON.parse(
      localStorage.getItem("gh_digest_last_snapshot") || "null",
    );
    return {
      login: localStorage.getItem("gh_username"),
      count: snapshot ? Object.keys(snapshot.prs).length : null,
      sections: snapshot
        ? [...new Set(Object.values(snapshot.prs).map((pr) => pr.section))]
        : [],
      error: document.querySelector('[role="alert"]')?.textContent || null,
    };
  });
  console.log(JSON.stringify({ ...result, browserErrors: errors }));
  if (result.error || result.count === null || errors.length)
    process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
}
