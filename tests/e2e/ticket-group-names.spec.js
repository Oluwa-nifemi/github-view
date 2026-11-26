import { test, expect } from "@playwright/test";

async function mountGroups(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "GitHub Digest — Setup" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem(
      "gh_digest_collapsed_sections",
      JSON.stringify({ mine: false }),
    );
    const { html } = await import("/src/ui/common.js");
    const main = await fetch("/src/main.js").then((response) =>
      response.text(),
    );
    const preactUrl = main.match(/from "([^"]*preact\.js[^"]*)"/)[1];
    const { render } = await import(preactUrl);
    const { PRList } = await import("/src/ui/PRList.js");
    const { useStored } = await import("/src/ui/state.js");
    const { session } = await import("/src/config.js");
    session.USERNAME = "me";
    const prs = Object.fromEntries(
      [1, 2, 3, 4].map((number) => {
        const ticket = number < 3 ? "AI-2046" : "AI-2072";
        const id = `acme/example#${number}`;
        return [
          id,
          {
            id,
            number,
            title: `${ticket} Change ${number}`,
            repo: "acme/example",
            author: "me",
            section: 4,
            url: `https://github.com/acme/example/pull/${number}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }),
    );
    function Fixture() {
      const [collapsedAuthors, setAuthors] = useStored(
        "gh_digest_collapsed_authors",
        ["jira:AI-2046", "jira:AI-2072"],
      );
      const [sections, setSections] = useStored(
        "gh_digest_collapsed_sections",
        {},
      );
      return html`<${PRList}
        prs=${prs}
        badges=${{}}
        action=${() => {}}
        state=${{ repos: [], authors: [], archived: {}, stashed: {}, notes: {}, promoted: [], collapsedAuthors, sections }}
        setAuthors=${setAuthors}
        setSections=${setSections}
      />`;
    }
    render(null, document.getElementById("root"));
    render(html`<${Fixture} />`, document.getElementById("root"));
  });
}

test("ticket group names persist without changing grouping or collapse state", async ({
  page,
}, testInfo) => {
  await mountGroups(page);
  const group = page.locator('[data-ticket="AI-2046"]');
  const rename = group.getByRole("button", { name: "Rename AI-2046 group" });
  await expect(rename).toHaveCSS("opacity", "0");
  await group.locator("summary").hover();
  await expect(rename).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("rename-hover.png") });
  await page.mouse.move(0, 0);
  await expect(rename).toHaveCSS("opacity", "0");
  await rename.focus();
  await expect(rename).toHaveCSS("opacity", "1");
  await group.getByRole("button", { name: "Rename AI-2046 group" }).click();
  const input = group.getByRole("textbox", { name: "Name for AI-2046 group" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("AI-2046");
  await input.fill("AI-2046 — Add model selector");
  await input.press("Enter");
  await expect(group.locator(".ticket-group-name")).toHaveText(
    "AI-2046 — Add model selector",
  );
  await expect(group).not.toHaveAttribute("open", "");
  await expect(group.locator("summary .count")).toHaveText("2");
  await expect(
    page.locator('[data-ticket="AI-2072"] .ticket-group-name'),
  ).toHaveText("AI-2072");
  await mountGroups(page);
  await expect(group.locator(".ticket-group-name")).toHaveText(
    "AI-2046 — Add model selector",
  );
  await group.locator("summary").click();
  await expect(group).toHaveAttribute("open", "");
  await expect(group.locator("article.card")).toHaveCount(2);
  await expect(group.locator("article.card").first()).toContainText(
    "AI-2046 Change",
  );
  await group.locator("summary").click();
  await page.screenshot({ path: testInfo.outputPath("renamed-groups.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await group.getByRole("button", { name: "Rename AI-2046 group" }).click();
  await expect(input).toHaveValue("AI-2046 — Add model selector");
  await page.screenshot({ path: testInfo.outputPath("mobile-rename.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("rename supports save, cancel, escape, reset and plain text", async ({
  page,
}) => {
  await mountGroups(page);
  const group = page.locator('[data-ticket="AI-2046"]');
  const rename = group.getByRole("button", { name: "Rename AI-2046 group" });
  const input = group.getByRole("textbox");
  await rename.click();
  await input.fill("  AI-2046 <b>Notes</b> & more  ");
  await group.getByRole("button", { name: "Save", exact: true }).click();
  await expect(group.locator(".ticket-group-name")).toHaveText(
    "AI-2046 <b>Notes</b> & more",
  );
  await expect(group.locator("summary b")).toHaveCount(0);
  for (const cancel of ["button", "escape"]) {
    await rename.click();
    await input.fill("Discard me");
    if (cancel === "button")
      await group.getByRole("button", { name: "Cancel" }).click();
    else await input.press("Escape");
    await expect(group.locator(".ticket-group-name")).toHaveText(
      "AI-2046 <b>Notes</b> & more",
    );
    await expect(rename).toBeFocused();
  }
  await rename.click();
  await input.fill("   ");
  await input.press("Enter");
  await expect(group.locator(".ticket-group-name")).toHaveText("AI-2046");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gh_digest_ticket_names")),
    ),
  ).toEqual({});
  await mountGroups(page);
  await expect(group.locator(".ticket-group-name")).toHaveText("AI-2046");
});

test("ticket names reject malformed saved values", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "gh_digest_ticket_names",
      JSON.stringify({
        "AI-2046": { name: "Invalid" },
        "AI-2072": "AI-2072 — Valid",
      }),
    ),
  );
  await mountGroups(page);
  await expect(
    page.locator('[data-ticket="AI-2046"] .ticket-group-name'),
  ).toHaveText("AI-2046");
  await expect(
    page.locator('[data-ticket="AI-2072"] .ticket-group-name'),
  ).toHaveText("AI-2072 — Valid");
});
