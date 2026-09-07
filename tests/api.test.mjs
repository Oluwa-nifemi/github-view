import test from "node:test";
import assert from "node:assert/strict";
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
