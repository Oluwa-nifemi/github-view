import test from "node:test";
import assert from "node:assert/strict";
import { fetchRecentNotifications } from "../src/github/notifications.js";
import {
  apiURL,
  ghJson,
  ghGraphQL,
  RateLimitError,
} from "../src/github/client.js";

const response = (data, headers = {}, status = 200) =>
  new Response(status === 304 ? null : JSON.stringify(data), {
    status,
    headers,
  });

test("notifications paginate through threads within 36 hours", async (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  let calls = 0;
  const since = new Date(now - 129600000).toISOString();
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("per_page"), "100");
    assert.equal(Date.parse(parsed.searchParams.get("since")), now - 129600000);
    if (parsed.searchParams.get("page") !== "2")
      return response(
        Array.from({ length: 100 }, (_, id) => ({
          id: String(id),
          reason: id === 0 ? "mention" : "review_requested",
          subject: { type: "PullRequest" },
          updated_at: new Date(now).toISOString(),
        })),
        {
          link: `<https://api.github.com/notifications?since=${encodeURIComponent(since)}&per_page=100&page=2>; rel="next"`,
        },
      );
    return response(
      Array.from({ length: 20 }, (_, id) => ({
        id: String(100 + id),
        reason: id === 0 ? "mention" : "review_requested",
        subject: { type: "PullRequest" },
        updated_at: new Date(now - (id === 1 ? 129600001 : 0)).toISOString(),
      })),
    );
  });
  const result = await fetchRecentNotifications("notification-fixture");
  assert.equal(calls, 2);
  assert.equal(result.extraNotifs.length, 2);
  assert.equal(result.notifications.length, 117);
});

test("notification actors are resolved from comments, PRs, and timeline events", async (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    if (path === "/notifications")
      return response([
        {
          id: "mention",
          reason: "mention",
          updated_at: new Date(now).toISOString(),
          subject: {
            type: "PullRequest",
            url: "https://api.github.com/repos/acme/repo/pulls/1",
            latest_comment_url:
              "https://api.github.com/repos/acme/repo/issues/comments/42",
          },
        },
        {
          id: "assign",
          reason: "assign",
          updated_at: new Date(now).toISOString(),
          subject: {
            type: "PullRequest",
            url: "https://api.github.com/repos/acme/repo/pulls/2",
            latest_comment_url:
              "https://api.github.com/repos/acme/repo/issues/comments/unrelated",
          },
        },
      ]);
    if (path === "/repos/acme/repo/issues/comments/42")
      return response({
        id: 42,
        user: { login: "commenter" },
        body: "Mention body",
        created_at: new Date(now - 2000).toISOString(),
        html_url: "https://github.com/acme/repo/pull/1#issuecomment-42",
      });
    if (path === "/repos/acme/repo/issues/2/timeline")
      return response([
        {
          event: "assigned",
          actor: { login: "assigner" },
          assignee: { login: "me" },
          created_at: new Date(now - 1000).toISOString(),
        },
      ]);
    throw new Error(`Unexpected request: ${path}`);
  });

  const result = await fetchRecentNotifications("notification-fixture");

  assert.deepEqual(
    result.extraNotifs.map(({ id, actor }) => ({ id, actor })),
    [
      { id: "mention", actor: "commenter" },
      { id: "assign", actor: "assigner" },
    ],
  );
  const assignment = result.extraNotifs.find((item) => item.id === "assign");
  assert.equal(assignment.eventAt, new Date(now - 1000).toISOString());
  assert.equal(assignment.preview, "Assigned to @me");
  assert.deepEqual(
    result.extraNotifs.find((item) => item.id === "mention"),
    {
      id: "mention",
      reason: "mention",
      updated_at: new Date(now).toISOString(),
      subject: {
        type: "PullRequest",
        url: "https://api.github.com/repos/acme/repo/pulls/1",
        latest_comment_url:
          "https://api.github.com/repos/acme/repo/issues/comments/42",
      },
      actor: "commenter",
      commentId: "42",
      eventAt: new Date(now - 2000).toISOString(),
      preview: "Mention body",
      commentUrl: "https://github.com/acme/repo/pull/1#issuecomment-42",
    },
  );
});

test("API URL rejects external and credential-bearing URLs before fetch", () => {
  assert.equal(apiURL("/user"), "https://api.github.com/user");
  for (const url of [
    "https://evil.example/user",
    "//evil.example/user",
    "https://user:pass@api.github.com/user",
    "http://api.github.com/user",
  ]) {
    assert.throws(() => apiURL(url), /Only GitHub/);
  }
});

test("REST arrays follow pagination while preserving auth and redirect protection", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? response([{ id: 1 }], {
          link: '<https://api.github.com/test?page=2>; rel="next"',
        })
      : response([{ id: 2 }]);
  });
  assert.deepEqual(await ghJson("/test", "test-token-a"), [
    { id: 1 },
    { id: 2 },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-token-a");
  assert.equal(calls[1].options.redirect, "error");
});

test("REST object pagination combines check runs and retains metadata", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++count === 1
      ? response(
          { total_count: 2, check_runs: [{ id: 1 }] },
          { link: '<https://api.github.com/checks?page=2>; rel="next"' },
        )
      : response({ total_count: 2, check_runs: [{ id: 2 }] }),
  );
  assert.deepEqual(await ghJson("/checks", "test-token-b"), {
    total_count: 2,
    check_runs: [{ id: 1 }, { id: 2 }],
  });
});

test("ETag cache works with 304 and is invalidated on account change", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests.push(options.headers);
    return requests.length === 2
      ? response(null, {}, 304)
      : response({ login: "test" }, { etag: "v1" });
  });
  await ghJson("/user", "account-one");
  assert.deepEqual(await ghJson("/user", "account-one"), { login: "test" });
  await ghJson("/user", "account-two");
  assert.equal(requests[1]["If-None-Match"], "v1");
  assert.equal(requests[2]["If-None-Match"], undefined);
});

test("malicious and repeated next links are rejected", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    response([], { link: '<https://evil.example/page>; rel="next"' }),
  );
  await assert.rejects(ghJson("/bad-link", "test-token-c"), /Only GitHub/);
  globalThis.fetch.mock.mockImplementation(async () =>
    response([], { link: '<https://api.github.com/repeat>; rel="next"' }),
  );
  await assert.rejects(
    ghJson("/repeat", "test-token-c"),
    /repeating pagination/,
  );
});

test("secondary limits and GraphQL limits produce retryable errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    response({}, { "retry-after": "2" }, 429),
  );
  await assert.rejects(
    ghJson("/limited", "test-token-d"),
    (error) => error instanceof RateLimitError && error.resetMs >= Date.now(),
  );
  globalThis.fetch.mock.mockImplementation(async () =>
    response({ errors: [{ type: "RATE_LIMITED", message: "limit" }] }),
  );
  await assert.rejects(
    ghGraphQL("{ viewer { login } }", "test-token-d"),
    RateLimitError,
  );
});
