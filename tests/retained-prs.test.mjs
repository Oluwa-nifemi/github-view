import test from "node:test";
import assert from "node:assert/strict";
import { retainSavedPRs } from "../src/ui/retainedPRs.js";

const pr = { id: "ardoq/ardoq-api#21057", title: "Saved PR" };

test("archive, deleted and set-aside PRs survive repeated search omissions", () => {
  for (const [archived, stashed] of [
    [{ [pr.id]: {} }, {}],
    [{ [pr.id]: { deleted: true } }, {}],
    [{}, { [pr.id]: {} }],
  ]) {
    const first = retainSavedPRs({}, { [pr.id]: pr }, archived, stashed);
    assert.deepEqual(first, { [pr.id]: pr });
    assert.deepEqual(retainSavedPRs({}, first, archived, stashed), first);
  }
});

test("saved details survive losing the snapshot or switching accounts", () => {
  assert.deepEqual(retainSavedPRs({}, null, { [pr.id]: { pr } }, {}), {
    [pr.id]: pr,
  });
});

test("fresh data wins over cached and saved details", () => {
  const fresh = { ...pr, title: "Updated PR" };
  assert.deepEqual(
    retainSavedPRs(
      { [pr.id]: fresh },
      { [pr.id]: pr },
      { [pr.id]: { pr } },
      {},
    ),
    { [pr.id]: fresh },
  );
});

test("does not retain unsaved PRs or invent missing legacy details", () => {
  assert.deepEqual(retainSavedPRs({}, { [pr.id]: pr }, {}, {}), {});
  assert.deepEqual(retainSavedPRs({}, null, { [pr.id]: {} }, {}), {});
  assert.deepEqual(retainSavedPRs({}, null, { other: { pr } }, {}), {});
});
