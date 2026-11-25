import { test, expect } from "@playwright/test";

test("PR cards identify your comments without a timestamp", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { html } = await import("/src/ui/common.js");
    const main = await fetch("/src/main.js").then((response) =>
      response.text(),
    );
    const preactUrl = main.match(/from "([^"]*preact\.js[^"]*)"/)[1];
    const { render } = await import(preactUrl);
    const { PRCard } = await import("/src/ui/PRCard.js");
    const { session } = await import("/src/config.js");
    session.USERNAME = "me";
    const state = { notes: {}, archived: {}, promoted: [], stashed: {} };
    const cases = [
      { id: "discussion", comments: [{ user: "ME" }] },
      { id: "inline", comments: [{ user: "me", path: "app.js" }] },
      { id: "review", reviews: [{ user: "me", state: "COMMENTED" }] },
      {
        id: "approval-body",
        reviews: [{ user: "me", state: "APPROVED", preview: "Looks good" }],
      },
      { id: "approval-only", reviews: [{ user: "me", state: "APPROVED" }] },
      { id: "other", comments: [{ user: "someone-else" }] },
      { id: "empty" },
      { id: "own", author: "ME", comments: [{ user: "me" }] },
      {
        id: "own-review",
        author: "me",
        reviews: [{ user: "me", state: "COMMENTED" }],
      },
    ];
    render(
      html`<div>
        ${cases.map(
          (data) =>
            html`<${PRCard}
              pr=${{ author: "author", title: data.id, section: 3, url: "https://github.com/acme/example/pull/1", ...data }}
              state=${state}
              action=${() => {}}
            />`,
        )}
      </div>`,
      document.body,
    );
  });
  for (const id of ["discussion", "inline", "review", "approval-body"])
    await expect(
      page
        .locator(`[data-pr-id="${id}"]`)
        .getByText("you commented", { exact: true }),
    ).toBeVisible();
  for (const id of ["approval-only", "other", "empty", "own", "own-review"])
    await expect(
      page
        .locator(`[data-pr-id="${id}"]`)
        .getByText("you commented", { exact: true }),
    ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("comment-indicators.png"),
  });
});
