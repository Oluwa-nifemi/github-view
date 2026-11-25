import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null };

const { config } = await import("../src/config.js");
const { search } = await import("../src/github/search.js");

const response = (data) => new Response(JSON.stringify(data));

test("PR search uses complete GraphQL pagination instead of REST search", async (t) => {
  config.IGNORED_REPOS = new Set(["acme/ignored-repo"]);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const secondPage = JSON.parse(options.body).query.includes('after: "next"');
    return response({
      data: {
        search: {
          issueCount: 2,
          pageInfo: secondPage
            ? { hasNextPage: false, endCursor: null }
            : { hasNextPage: true, endCursor: "next" },
          nodes: [
            {
              number: secondPage ? 2 : 1,
              title: secondPage ? "Second" : "First",
              url: `https://github.com/acme/example/pull/${secondPage ? 2 : 1}`,
              updatedAt: "2026-09-09T10:00:00Z",
              createdAt: "2026-09-08T10:00:00Z",
              isDraft: false,
              author: { login: "author" },
              assignees: { nodes: [] },
              repository: { nameWithOwner: "acme/example" },
            },
          ],
        },
      },
    });
  });

  const items = await search("is:pr is:open org:acme", "token");

  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => new URL(url).pathname === "/graphql"));
  assert.match(requests[0].body.query, /-repo:acme\/ignored-repo/);
  assert.deepEqual(
    items.map(({ number, repository_url }) => ({ number, repository_url })),
    [
      {
        number: 1,
        repository_url: "https://api.github.com/repos/acme/example",
      },
      {
        number: 2,
        repository_url: "https://api.github.com/repos/acme/example",
      },
    ],
  );
});
