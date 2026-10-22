import { test, expect } from "@playwright/test";

test("archived and set-aside PRs survive empty searches and reloads", async ({
  page,
}) => {
  let omitted = false;
  let updatedAt = "2026-10-22T12:00:00Z";
  await page.addInitScript(() => {
    localStorage.setItem("gh_token", "synthetic-test-token");
    localStorage.setItem("gh_username", "me");
  });
  await page.route("https://api.github.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data;
    if (path === "/user") data = { login: "me" };
    else if (path.includes("/members")) data = [];
    else if (path === "/notifications") data = [];
    else if (path === "/graphql") {
      const query = route.request().postDataJSON().query;
      const nodes = omitted
        ? []
        : [
            {
              number: 1,
              title: "Archived fixture",
              author: { login: "other" },
            },
            { number: 2, title: "Set aside fixture", author: { login: "me" } },
          ]
            .filter((pr) =>
              query.includes(
                pr.number === 1 ? "review-requested:me" : "author:me",
              ),
            )
            .map((pr) => ({
              ...pr,
              updatedAt,
              createdAt: updatedAt,
              url: `https://github.com/ardoq/example/pull/${pr.number}`,
              repository: { nameWithOwner: "ardoq/example" },
              assignees: { nodes: [] },
            }));
      data = {
        data: query.includes("search(")
          ? {
              search: {
                nodes,
                issueCount: nodes.length,
                pageInfo: { hasNextPage: false },
              },
            }
          : { pr0: { pullRequest: { reviewDecision: "REVIEW_REQUIRED" } } },
      };
    } else if (path.endsWith("/check-runs")) data = { check_runs: [] };
    else if (path.endsWith("/status")) data = { statuses: [] };
    else if (path.endsWith("/requested_reviewers"))
      data = { users: [], teams: [] };
    else if (/\/pulls\/\d+$/.test(path))
      data = {
        head: { sha: "fixture" },
        requested_reviewers: [],
        requested_teams: [],
        additions: 1,
        deletions: 0,
      };
    else data = [];
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await expect(refresh).toBeEnabled();
  const archived = page.locator('[data-pr-id="ardoq/example#1"]');
  const stashed = page.locator('[data-pr-id="ardoq/example#2"]');
  await archived.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: /Archived/ }).click();
  await page.getByRole("button", { name: /Your Open PRs/ }).click();
  await stashed.getByRole("button", { name: "Set aside for later" }).click();
  await page.getByText("🗄 Set aside").click();
  omitted = true;
  for (let i = 0; i < 2; i++) {
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(archived).toBeVisible();
    await expect(stashed).toBeVisible();
  }
  await page.reload();
  await expect(refresh).toBeEnabled();
  await expect(archived).toBeVisible();
  await page.getByText("🗄 Set aside").click();
  await expect(stashed).toBeVisible();
  omitted = false;
  updatedAt = "2026-10-22T13:00:00Z";
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(page.locator("#section-3b")).toContainText("Archived fixture");
  await expect(stashed).toBeVisible();
});
