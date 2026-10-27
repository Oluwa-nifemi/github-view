import test from "node:test";
import assert from "node:assert/strict";
import { retainSavedPRs, retainOpenSavedPRs } from "../src/ui/retainedPRs.js";

const pr = { id: "ardoq/ardoq-api#21057", title: "Saved PR" };

test("set-aside PRs survive search omissions only while still open", async () => {
  for (const detail of [
    { state: "open" },
    { state: "closed" },
    { state: "closed", merged: true },
  ]) {
    let calls = 0;
    const retained = await retainOpenSavedPRs(
      {},
      null,
      {},
      { [pr.id]: { pr } },
      async (id) => {
        assert.equal(id, pr.id);
        calls++;
        return detail;
      },
    );
    assert.equal(calls, 1);
    assert.deepEqual(retained, detail.state === "open" ? { [pr.id]: pr } : {});
  }
});

test("saved-state lookup failures reject rather than hide PRs", async () => {
  await assert.rejects(
    retainOpenSavedPRs({}, { [pr.id]: pr }, {}, { [pr.id]: {} }, async () => {
      throw new Error("GitHub unavailable");
    }),
    /GitHub unavailable/,
  );
});

test("fresh and archived PRs do not need saved-state lookups", async () => {
  const loadPR = () => {
    throw new Error("Unexpected lookup");
  };
  assert.deepEqual(
    await retainOpenSavedPRs(
      { [pr.id]: pr },
      null,
      {},
      { [pr.id]: {} },
      loadPR,
    ),
    { [pr.id]: pr },
  );
  assert.deepEqual(
    await retainOpenSavedPRs(
      {},
      null,
      { [pr.id]: { pr } },
      { [pr.id]: {} },
      loadPR,
    ),
    { [pr.id]: pr },
  );
});

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
