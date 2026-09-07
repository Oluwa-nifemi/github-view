import test from "node:test";
import assert from "node:assert/strict";
import { isReplyToUser, retainedHistory } from "../.gh-digest/watch.mjs";

test("replies are attributed only to the parent comment author", () => {
  const parents = [
    { id: 1, user: { login: "me" } },
    { id: 2, user: { login: "someone" } },
  ];
  assert.equal(isReplyToUser({ in_reply_to_id: 1 }, parents, "me"), true);
  assert.equal(isReplyToUser({ in_reply_to_id: 2 }, parents, "me"), false);
  assert.equal(isReplyToUser({ in_reply_to_id: 3 }, parents, "me"), false);
  assert.equal(isReplyToUser({}, parents, "me"), false);
});

test("history migrates legacy keys, expires old entries and rejects malformed data", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const state = {
    updatedAt: "2026-09-06T12:00:00Z",
    seen: [
      "legacy",
      { key: "recent", seenAt: now },
      { key: "old", seenAt: now - 31 * 86400000 },
      null,
      { key: "broken" },
    ],
  };
  assert.deepEqual(
    retainedHistory(state, now).map((entry) => entry.key),
    ["legacy", "recent"],
  );
  assert.equal(
    retainedHistory(
      {
        seen: Array.from({ length: 10005 }, (_, index) => ({
          key: String(index),
          seenAt: now,
        })),
      },
      now,
    ).length,
    10000,
  );
});
