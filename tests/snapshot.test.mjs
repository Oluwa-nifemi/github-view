import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};

const { config, session } = await import("../src/config.js");
const { getTeammates } = await import("../src/github/teammates.js");
const { bucketForPR } = await import("../src/ui/PRList.js");
const { collectMyItems, excludeOwnedReviewItems } =
  await import("../src/snapshot/sources.js");

const item = (number, author) => ({
  number,
  user: { login: author },
  repository_url: "https://api.github.com/repos/acme/example",
});

test("authored PRs take priority over review-request sources", () => {
  const mine = item(1, "me");
  const teammate = item(2, "teammate");
  const myItemsMap = new Map([["acme/example#1", mine]]);

  assert.deepEqual(excludeOwnedReviewItems([mine, teammate], myItemsMap), [
    teammate,
  ]);
});

test("my PRs are recovered from any search source", () => {
  const mine = item(1, "ME");
  const teammate = item(2, "teammate");

  assert.deepEqual(
    collectMyItems({
      username: "me",
      agentBotLogin: "agent-bot",
      sources: [[teammate], [mine]],
    }),
    [mine],
  );
});

test("assigned agent PRs belong to me and take priority over review requests", () => {
  for (const author of ["agent-bot", "agent-bot[bot]", "AGENT-BOT"]) {
    const assigned = { ...item(1, author), assignees: [{ login: "ME" }] };
    const unassigned = item(2, author);
    const assignedElsewhere = {
      ...item(3, author),
      assignees: [{ login: "teammate" }],
    };
    const human = { ...item(4, "teammate"), assignees: [{ login: "me" }] };
    const reviewItems = [assigned, unassigned, assignedElsewhere, human];
    const mine = collectMyItems({
      username: "me",
      agentBotLogin: "agent-bot",
      sources: [reviewItems, [assigned]],
    });

    assert.deepEqual(mine, [assigned]);
    assert.deepEqual(
      excludeOwnedReviewItems(
        reviewItems,
        new Map(mine.map((pr) => [`acme/example#${pr.number}`, pr])),
      ),
      [unassigned, assignedElsewhere, human],
    );
  }
});

test("empty agent bot config does not claim bot PRs", () => {
  const botPr = { ...item(1, "some-bot"), assignees: [{ login: "me" }] };
  assert.deepEqual(
    collectMyItems({
      username: "me",
      agentBotLogin: "",
      sources: [[botPr]],
    }),
    [],
  );
});

test("the signed-in user is not their own teammate and empty org/teams skip API calls", async () => {
  session.USERNAME = "Me";
  config.ORG = "";
  config.TEAMS = [];
  config.EXTRA_TEAMMATES = ["extra1", "extra2"];
  assert.deepEqual([...(await getTeammates("token"))].sort(), [
    "extra1",
    "extra2",
  ]);

  config.ORG = "acme";
  config.TEAMS = ["team-alpha", "team-beta"];
  values.set(
    "gh_digest_team_members",
    JSON.stringify({
      org: "acme",
      teams: ["team-alpha", "team-beta"],
      members: ["me", "teammate"],
      fetchedAt: Date.now(),
    }),
  );

  assert.deepEqual([...(await getTeammates("token"))].sort(), [
    "extra1",
    "extra2",
    "teammate",
  ]);
});

test("my PR renders in Your Open PRs unless explicitly pinned", () => {
  session.USERNAME = "me";
  session.teammates = new Set(["teammate"]);
  const pr = { id: "acme/example#1", author: "ME", section: 3 };
  const state = { archived: {}, promoted: [] };

  assert.equal(bucketForPR(pr, state), "mine");
  assert.equal(bucketForPR(pr, { ...state, promoted: [pr.id] }), "priority");
});
