import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const timestamp = new Date().toISOString();

test("saved self-assignment appears in activity instead of needs you", async ({
  page,
}, testInfo) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "gh_digest_notifications",
      JSON.stringify([
        {
          id: "self-assignment",
          key: "assigned:ardoq/example#99:self-assignment",
          type: "assigned",
          actor: "fixture-user",
          prId: "ardoq/example#99",
          prTitle: "Self-assigned task",
          prUrl: "https://github.com/ardoq/example/pull/99",
          preview: "Assigned to @fixture-user",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByText("Needs you", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Activity", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("self-assignment.png") });
});

test("saved repeated assignments show one useful notification", async ({
  page,
}, testInfo) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "gh_digest_notifications",
      JSON.stringify(
        Array.from({ length: 7 }, (_, index) => ({
          id: `assignment-${index}`,
          key: `assigned:ardoq/ardoq-packages#37728:thread:${index}`,
          type: "assigned",
          actor: "Claudette2-0",
          prId: "ardoq/ardoq-packages#37728",
          prTitle: "AI-2080 Add model selector",
          prUrl: "https://github.com/ardoq/ardoq-packages/pull/37728",
          preview: "",
          createdAt: new Date().toISOString(),
        })),
      ),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("link", { name: "Assigned to you", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Open notification", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("7 updates", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("assignment-notification.png"),
  });
});
const issue = (number, author, title, repo = "ardoq/example") => ({
  number,
  title,
  user: { login: author },
  state: "open",
  draft: false,
  html_url: `https://github.com/${repo}/pull/${number}`,
  repository_url: `https://api.github.com/repos/${repo}`,
  created_at: timestamp,
  updated_at: timestamp,
});
const requested = issue(1, "outside-user", "Review the synthetic API change");
const mine = issue(
  2,
  "fixture-user",
  "Improve synthetic dashboard accessibility",
  "ardoq/frontend",
);

async function mockGitHub(
  page,
  { authenticated = true, corrupt = false } = {},
) {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.addInitScript(
    ({ authenticated, corrupt }) => {
      if (sessionStorage.getItem("fixture-initialized")) return;
      sessionStorage.setItem("fixture-initialized", "1");
      if (authenticated) {
        localStorage.setItem("gh_token", "synthetic-test-token");
        localStorage.setItem("gh_username", "fixture-user");
      }
      if (corrupt)
        for (const key of [
          "gh_digest_last_snapshot",
          "gh_digest_notifications",
          "gh_digest_notes",
          "gh_digest_promoted",
          "gh_digest_user_config",
        ])
          localStorage.setItem(key, "{broken");
    },
    { authenticated, corrupt },
  );
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    let data;
    if (url.pathname === "/user") data = { login: "fixture-user" };
    else if (url.pathname.includes("/members")) data = [{ login: "team-user" }];
    else if (url.pathname === "/notifications") data = [];
    else if (url.pathname === "/graphql") {
      const query = route.request().postDataJSON().query;
      const items = query.includes("review-requested:fixture-user")
        ? [requested]
        : query.includes("author:fixture-user")
          ? [mine]
          : [];
      data = {
        data: query.includes("search(")
          ? {
              search: {
                issueCount: items.length,
                nodes: items.map((item) => ({
                  number: item.number,
                  title: item.title,
                  url: item.html_url,
                  updatedAt: item.updated_at,
                  createdAt: item.created_at,
                  isDraft: item.draft,
                  author: item.user,
                  assignees: { nodes: [] },
                  repository: {
                    nameWithOwner: item.repository_url.replace(
                      "https://api.github.com/repos/",
                      "",
                    ),
                  },
                })),
                pageInfo: { hasNextPage: false },
              },
            }
          : { pr0: { pullRequest: { reviewDecision: "REVIEW_REQUIRED" } } },
      };
    } else if (url.pathname.endsWith("/requested_reviewers"))
      data = { users: [{ login: "fixture-user" }], teams: [] };
    else if (/\/(reviews|comments|commits)$/.test(url.pathname)) data = [];
    else if (url.pathname.endsWith("/check-runs")) data = { check_runs: [] };
    else if (url.pathname.endsWith("/status")) data = { statuses: [] };
    else if (/\/pulls\/\d+$/.test(url.pathname)) {
      const item = url.pathname.endsWith("/1") ? requested : mine;
      data = {
        ...item,
        head: { sha: "fixture-sha" },
        additions: 12,
        deletions: 3,
        requested_reviewers: [],
        requested_teams: [],
      };
    } else
      throw new Error(`Unexpected GitHub fixture request: ${url.pathname}`);
    await route.fulfill({ json: data });
  });
  return failures;
}

const card = (page, id) => page.locator(`article.card[data-pr-id="${id}"]`);
const section = (page, name) =>
  page.locator("section.section").filter({
    has: page.getByRole("button", { name: new RegExp(name) }),
  });
async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#summary")).toContainText("since last refresh");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            JSON.parse(localStorage.getItem("gh_digest_last_snapshot") || "{}")
              .prs || {},
          ).length,
      ),
    )
    .toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
}

test("shows primary PRs before notification history completes without caching partial data", async ({
  page,
}) => {
  await mockGitHub(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route("https://api.github.com/notifications?**", async (route) => {
    count++;
    await gate;
    await route.fulfill({ json: [] });
  });
  await page.goto("/");
  try {
    await expect(card(page, "ardoq/example#1")).toBeVisible();
    await expect(page.locator("#last-refresh")).toHaveText(
      "Loading remaining activity…",
    );
    expect(
      await page.evaluate(() =>
        localStorage.getItem("gh_digest_last_snapshot"),
      ),
    ).toBeNull();
  } finally {
    release();
  }
  await expect(page.locator("#refresh-btn")).toBeEnabled();
  expect(count).toBe(1);
  await expect(page.locator("#summary")).toBeVisible();
});

test("connects, refreshes successfully, and disconnects", async ({ page }) => {
  const errors = await mockGitHub(page, { authenticated: false });
  await page.goto("/");
  await page
    .getByLabel("GitHub token", { exact: true })
    .fill("synthetic-test-token");
  await page
    .getByRole("button", { name: "Save and load", exact: true })
    .click();
  await expect(page.locator("#summary")).toContainText("since last refresh");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("#summary")).toContainText("since last refresh");
  await expect(card(page, "ardoq/example#1")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "GitHub Digest — Setup" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("gh_token")),
  ).toBeNull();
  expect(errors).toEqual([]);
});

test("persists notes and moves cards through pin, archive, delete, restore and set-aside", async ({
  page,
}) => {
  const errors = await mockGitHub(page);
  await ready(page);
  const requestedCard = card(page, "ardoq/example#1");
  await requestedCard.getByRole("button", { name: "Edit note" }).click();
  await requestedCard
    .getByLabel("PR note")
    .fill("Check keyboard focus <script>literal text</script>");
  await requestedCard.getByLabel("PR note").press("Enter");
  await page.reload();
  await expect(requestedCard).toContainText(
    "Check keyboard focus <script>literal text</script>",
  );
  await requestedCard
    .getByRole("button", { name: "Pin to High Priority", exact: true })
    .click();
  await expect(section(page, "High Priority")).toContainText(requested.title);
  await requestedCard
    .getByRole("button", { name: "Unpin from High Priority" })
    .click();
  await expect(section(page, "Team Requests")).toContainText(requested.title);
  await requestedCard
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expand(page, "Archived");
  await expect(section(page, "Archived")).toContainText(requested.title);
  await requestedCard
    .getByRole("button", { name: "Delete permanently from digest" })
    .click();
  await expand(page, "Deleted");
  await expect(section(page, "Deleted")).toContainText(requested.title);
  await requestedCard
    .getByRole("button", { name: "Restore", exact: true })
    .click();
  await expect(section(page, "Team Requests")).toContainText(requested.title);
  const mineCard = card(page, "ardoq/frontend#2");
  await expand(page, "Your Open PRs");
  await mineCard.getByRole("button", { name: "Set aside for later" }).click();
  await expect(mineCard.locator("xpath=ancestor::details")).toContainText(
    "Set aside",
  );
  await mineCard.locator("xpath=ancestor::details").locator("summary").click();
  await mineCard
    .getByRole("button", { name: "Move back to active list" })
    .click();
  await expect(
    mineCard.locator("xpath=ancestor::div[@data-status='awaiting']"),
  ).toContainText("Awaiting review");
  await requestedCard.getByRole("button", { name: "Delete note" }).click();
  await expect(requestedCard.locator(".card-note")).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function expand(page, name) {
  const button = page.getByRole("button", { name: new RegExp(name) });
  if ((await button.getAttribute("aria-expanded")) === "false")
    await button.click();
}

async function downloadJSON(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("retains the complete cached snapshot when a CI enrichment request fails", async ({
  page,
}) => {
  await mockGitHub(page);
  await ready(page);
  const previous = await page.evaluate(() =>
    localStorage.getItem("gh_digest_last_snapshot"),
  );
  await page.route("**/commits/*/check-runs?*", (route) =>
    route.fulfill({ status: 500, json: { message: "Synthetic CI outage" } }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your last successful refresh is still shown",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("gh_digest_last_snapshot")),
  ).toBe(previous);
  await expect(card(page, "ardoq/example#1")).toBeVisible();
  await expect(page.locator("#summary")).toContainText("since last refresh");
});

test("coalesces button and stale visibility refreshes into one API batch", async ({
  page,
}) => {
  await mockGitHub(page);
  await ready(page);
  let userRequests = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("https://api.github.com/user", async (route) => {
    userRequests++;
    await gate;
    await route.fulfill({ json: { login: "fixture-user" } });
  });
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 240000;
    document.querySelector("#refresh-btn").click();
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => userRequests).toBe(1);
  release();
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled();
  expect(userRequests).toBe(1);
});

test("exports and imports notes without exporting or replacing credentials", async ({
  page,
}) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "gh_digest_notes",
      JSON.stringify({
        "ardoq/example#1": { text: "Portable synthetic note" },
      }),
    ),
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Move browser settings", { exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const exported = await downloadJSON(await downloading);
  expect(exported.settings.gh_digest_notes["ardoq/example#1"].text).toBe(
    "Portable synthetic note",
  );
  expect(exported.settings).not.toHaveProperty("gh_token");
  expect(exported.settings).not.toHaveProperty("gh_digest_last_snapshot");
  expect(JSON.stringify(exported)).not.toContain("synthetic-test-token");
  exported.settings.gh_digest_notes["ardoq/example#1"].text =
    "Imported synthetic note";
  exported.settings.gh_token = "must-not-replace-token";
  await page.locator("input[type=file]").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(card(page, "ardoq/example#1")).toContainText(
    "Imported synthetic note",
  );
  expect(await page.evaluate(() => localStorage.getItem("gh_token"))).toBe(
    "synthetic-test-token",
  );
});

test("legacy file URL exports intact notes while omitting credentials and malformed settings", async ({
  page,
}) => {
  await page.goto(pathToFileURL(resolve("github-digest.html")).href);
  await page.evaluate(() => {
    localStorage.setItem("gh_token", "private-synthetic-legacy-token");
    localStorage.setItem(
      "gh_digest_notes",
      JSON.stringify({ "ardoq/example#1": { text: "Legacy synthetic note" } }),
    );
    localStorage.setItem("gh_digest_promoted", "{malformed");
  });
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export settings", exact: true })
    .click();
  const exported = await downloadJSON(await downloading);
  expect(exported.settings.gh_digest_notes["ardoq/example#1"].text).toBe(
    "Legacy synthetic note",
  );
  expect(exported.settings).not.toHaveProperty("gh_token");
  expect(exported.settings).not.toHaveProperty("gh_digest_promoted");
  expect(JSON.stringify(exported)).not.toContain(
    "private-synthetic-legacy-token",
  );
});

test("renders desktop in light and dark themes without overflow", async ({
  page,
}, testInfo) => {
  await mockGitHub(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await expand(page, "Your Open PRs");
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`desktop-${colorScheme}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("desktop-settings.png"),
    fullPage: true,
  });
});

test("filters authors and repositories, collapses sections, and saves settings", async ({
  page,
}) => {
  await mockGitHub(page);
  await ready(page);
  await page.getByRole("button", { name: "outside-user", exact: true }).click();
  await expect(card(page, "ardoq/frontend#2")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.locator('#repo-chips [data-repo="ardoq/frontend"]').click();
  await expect(card(page, "ardoq/example#1")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: /Team Requests/ }).click();
  await expect(card(page, "ardoq/example#1")).toBeHidden();
  await page.getByRole("button", { name: /Team Requests/ }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Add extra teammate", { exact: true })
    .fill("another-user");
  await page.locator("#extra-teammate-add").click();
  await expect(page.locator("#extra-teammates-tags")).toContainText(
    "another-user",
  );
  await page.getByLabel("Job name pattern").fill("optional-check");
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await expect(page.locator("#ignore-rules")).toContainText("optional-check");
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#extra-teammates-tags")).toContainText(
    "another-user",
  );
  await expect(page.getByRole("dialog")).toContainText("optional-check");
});

test("notification read and pin states survive reload", async ({
  page,
}, testInfo) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(
    (timestamp) =>
      localStorage.setItem(
        "gh_digest_notifications",
        JSON.stringify([
          {
            id: "fixture-event",
            key: "fixture-event",
            type: "mentioned",
            actor: "team-user",
            prId: "ardoq/example#1",
            prTitle: "Synthetic mention",
            prUrl: "https://github.com/ardoq/example/pull/1",
            createdAt: timestamp,
            preview: "Please review this change",
            readAt: null,
          },
        ]),
      ),
    timestamp,
  );
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("desktop-notifications.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pin Synthetic mention" }).click();
  await page.route("https://github.com/**", (route) =>
    route.fulfill({ body: "Fixture GitHub" }),
  );
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Synthetic mention", exact: true })
    .click();
  await (await popupPromise).close();
  await expect(page.locator(".pr-thread")).toContainText("Synthetic mention");
  await page
    .getByRole("button", { name: "Mark read: Synthetic mention" })
    .click();
  await expect(page.locator(".pr-thread")).toHaveCount(0);
  await page.locator('[data-notif-filter="read"]').click();
  await expect(page.locator(".pr-thread")).toContainText("Synthetic mention");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unpin Synthetic mention" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark unread: Synthetic mention" })
    .click();
  await page.locator('[data-notif-filter="unread"]').click();
  await expect(page.locator(".pr-thread")).toBeVisible();
});

test("opening notification links preserves unread state", async ({ page }) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(() => {
    const base = {
      type: "mentioned",
      actor: "team-user",
      prId: "ardoq/example#1",
      prTitle: "Grouped activity",
      prUrl: "https://github.com/ardoq/example/pull/1",
    };
    localStorage.setItem(
      "gh_digest_notifications",
      JSON.stringify([
        {
          ...base,
          id: "old",
          key: "old",
          preview: "Already read comment",
          createdAt: new Date(Date.now() - 3000).toISOString(),
          readAt: Date.now(),
        },
        {
          ...base,
          id: "first",
          key: "first",
          preview: "Unread first comment",
          commentUrl: base.prUrl + "#first",
          createdAt: new Date(Date.now() - 2000).toISOString(),
        },
        {
          ...base,
          id: "second",
          key: "second",
          preview: "Unread second comment",
          commentUrl: base.prUrl + "#second",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator(".pr-thread")).not.toContainText(
    "Already read comment",
  );
  await expect(page.locator(".notif-comment")).toHaveCount(2);
  await expect(page.locator(".notif-comments")).toContainText(
    "Unread second comment",
  );
  await expect(
    page.locator(".notif-actor", { hasText: "team-user" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toHaveCount(1);
  await page.route("https://github.com/**", (route) =>
    route.fulfill({ body: "Fixture GitHub" }),
  );
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Unread first comment", exact: true })
    .click();
  await (await popup).close();
  await expect(page.locator(".pr-thread")).toContainText(
    "Unread first comment",
  );
  await expect(page.locator(".pr-thread")).toContainText(
    "Unread second comment",
  );
  await page
    .getByRole("button", { name: "Mark read: Grouped activity" })
    .click();
  await expect(page.locator(".pr-thread")).toHaveCount(0);
  await page.locator('[data-notif-filter="read"]').click();
  await expect(page.locator(".pr-thread")).toContainText(
    "Already read comment",
  );
  await expect(page.locator(".pr-thread")).toContainText(
    "Unread first comment",
  );
  await expect(page.locator(".pr-thread")).toContainText(
    "Unread second comment",
  );
  await page
    .getByRole("button", { name: "Mark unread: Grouped activity" })
    .click();
  await page.locator('[data-notif-filter="unread"]').click();
  await page.locator(".notif-pr-title").hover();
  await expect(page.locator(".notif-pr-title")).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  await page
    .getByRole("button", { name: "Mark read: Grouped activity" })
    .click();
  await expect(page.locator(".pr-thread")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".pr-thread")).toHaveCount(0);
});

test("notifications hide selection until group bulk mode is enabled", async ({
  page,
}) => {
  await mockGitHub(page);
  await ready(page);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    localStorage.setItem(
      "gh_digest_notifications",
      JSON.stringify([
        {
          id: "needs-1",
          type: "mentioned",
          actor: "team-user",
          prId: "ardoq/example#1",
          prTitle: "First grouped PR",
          prUrl: "https://github.com/ardoq/example/pull/1",
          preview: "First notification",
          createdAt: now,
        },
        {
          id: "needs-2",
          type: "assigned",
          actor: "team-user",
          prId: "ardoq/example#1",
          prTitle: "First grouped PR",
          prUrl: "https://github.com/ardoq/example/pull/1",
          preview: "Second notification",
          createdAt: now,
        },
        {
          id: "activity-1",
          type: "comment_on_watched_pr",
          actor: "outside-user",
          prAuthor: "outside-author",
          prId: "ardoq/example#1",
          prTitle: "First grouped PR",
          prUrl: "https://github.com/ardoq/example/pull/1",
          preview: "Background notification",
          createdAt: now,
        },
        {
          id: "needs-3",
          type: "mentioned",
          actor: "team-user",
          prId: "ardoq/example#2",
          prTitle: "Second grouped PR",
          prUrl: "https://github.com/ardoq/example/pull/2",
          preview: "Third notification",
          createdAt: now,
        },
      ]),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();

  await expect(page.getByText("2 conversations")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator("#notif-needs-you .notif-comment")).toHaveCount(3);
  await expect(page.locator("#notif-activity .notif-comment")).toHaveCount(1);
  await expect(
    page.locator("#notif-needs-you .notif-actor", { hasText: "team-user" }),
  ).toHaveCount(2);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByLabel("Select Second grouped PR").check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await expect(page.locator("#notif-needs-you .pr-thread")).toHaveCount(1);
  await expect(page.locator("#notif-activity .pr-thread")).toHaveCount(1);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("recovers corrupt storage and stays within a mobile viewport", async ({
  page,
}, testInfo) => {
  const errors = await mockGitHub(page, { corrupt: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile-dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile-settings.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
