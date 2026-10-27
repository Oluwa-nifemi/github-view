import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const { session } = await import("../src/config.js");
const { classifyMyPR, latestNonCommentReviewsByReviewer, isHandledByReview } =
  await import("../src/domain/reviews.js");
const { ciFailing } = await import("../src/snapshot/ci.js");
const { collectNotificationEvents, repairNotificationActors } =
  await import("../src/notifications/events.js");
const {
  notificationActorGroups,
  notificationSection,
  notificationGroups,
  partitionNotificationGroups,
  unreadThreadCount,
} = await import("../src/ui/Notifications.js");
const { diff, hasActionableActivitySince } =
  await import("../src/domain/activity.js");
const { normalize, read } = await import("../src/ui/state.js");
const { startRefreshScheduler } = await import("../src/ui/refreshScheduler.js");
session.USERNAME = "me";
const at = "2026-09-07T10:00:00Z";
const later = "2026-09-07T11:00:00Z";
const review = (state, submittedAt = at, user = "reviewer") => ({
  user,
  state,
  submittedAt,
});

test("background refresh uses a worker heartbeat", () => {
  let listener;
  let terminated = false;
  let refreshes = 0;
  const stop = startRefreshScheduler(
    () => refreshes++,
    () => ({
      addEventListener: (type, callback) => {
        assert.equal(type, "message");
        listener = callback;
      },
      terminate: () => {
        terminated = true;
      },
    }),
  );

  listener();
  assert.equal(refreshes, 1);
  stop();
  assert.equal(terminated, true);
});

test("an existing PR is not new only because its section changed", () => {
  const oldSnap = {
    prs: {
      "ardoq/example#1": {
        author: "me",
        section: 3,
        updatedAt: at,
        reviews: [],
        comments: [],
      },
    },
  };
  const moved = {
    prs: {
      "ardoq/example#1": {
        ...oldSnap.prs["ardoq/example#1"],
        section: 4,
      },
    },
  };
  const changed = {
    prs: {
      "ardoq/example#1": {
        ...moved.prs["ardoq/example#1"],
        updatedAt: later,
      },
    },
  };

  assert.deepEqual(diff(oldSnap, moved), {});
  assert.deepEqual(diff(oldSnap, changed), {
    "ardoq/example#1": "UPDATED",
  });
});

test("comments after approval do not require attention, but reviews and commits do", () => {
  const comments = [{ user: "author", createdAt: later }];
  const commentOnlyReview = {
    user: { login: "author" },
    state: "COMMENTED",
    submitted_at: later,
  };
  assert.equal(
    hasActionableActivitySince(
      at,
      "APPROVED",
      [commentOnlyReview],
      comments,
      [],
    ),
    false,
  );
  assert.equal(
    hasActionableActivitySince(
      at,
      "APPROVED",
      [{ ...commentOnlyReview, state: "CHANGES_REQUESTED" }],
      comments,
      [],
    ),
    true,
  );
  assert.equal(
    hasActionableActivitySince(at, "APPROVED", [], comments, [
      {
        author: { login: "author" },
        commit: { committer: { date: later } },
      },
    ]),
    true,
  );
  assert.equal(hasActionableActivitySince(at, null, [], comments, []), true);
});

test("direct requests and outstanding changes stay actionable despite another approval", () => {
  const pr = { author: "author", reviews: [review("APPROVED")] };
  assert.equal(isHandledByReview(pr), true);
  assert.equal(isHandledByReview({ ...pr, isDirect: true }), false);
  assert.equal(
    isHandledByReview({ ...pr, pendingReviewerLogins: ["reviewer"] }),
    false,
  );
  assert.equal(
    isHandledByReview({
      ...pr,
      reviews: [...pr.reviews, review("CHANGES_REQUESTED", later, "other")],
    }),
    false,
  );
});

test("latest formal review wins; author comments and rerequested reviews cannot approve", () => {
  const reviews = [
    review("CHANGES_REQUESTED"),
    review("APPROVED", later),
    review("COMMENTED", "2026-09-07T12:00:00Z"),
    review("APPROVED", later, "me"),
  ];
  const latest = latestNonCommentReviewsByReviewer(reviews, "me", []);
  assert.equal(latest.size, 1);
  assert.equal(latest.get("reviewer").state, "APPROVED");
  assert.equal(
    latestNonCommentReviewsByReviewer(reviews, "me", ["reviewer"]).size,
    0,
  );
});

test("classification respects CI, changes requested, branch review decision and rerequests", () => {
  const pr = {
    author: "me",
    reviews: [review("APPROVED")],
    pendingReviewers: 0,
  };
  assert.equal(classifyMyPR(pr), "approved");
  assert.equal(classifyMyPR({ ...pr, ciFailing: true }), "ci_failing");
  assert.equal(
    classifyMyPR({ ...pr, reviews: [review("CHANGES_REQUESTED")] }),
    "changes_requested",
  );
  assert.equal(
    classifyMyPR({ ...pr, reviewDecision: "REVIEW_REQUIRED" }),
    "awaiting",
  );
  assert.equal(
    classifyMyPR({
      ...pr,
      pendingReviewers: 1,
      pendingReviewerLogins: ["reviewer"],
    }),
    "awaiting",
  );
});

test("a newer CI rerun supersedes an older attempt even when the older one finishes later", () => {
  const old = {
    app: { id: 1 },
    name: "tests",
    started_at: at,
    completed_at: "2026-09-07T11:30:00Z",
    conclusion: "failure",
  };
  const rerun = {
    app: { id: 1 },
    name: "tests",
    started_at: later,
    completed_at: null,
    conclusion: null,
  };
  assert.equal(ciFailing("org/repo", [old, rerun], []), false);
  assert.equal(ciFailing("org/repo", [rerun, old], []), false);
  assert.equal(
    ciFailing("org/repo", [rerun, { ...old, app: { id: 2 } }], []),
    true,
  );
});

test("CI ignore rules are scoped to repository and check name", () => {
  values.set(
    "gh_digest_ignored_ci",
    JSON.stringify([{ repo: "org/repo", pattern: "lint" }]),
  );
  const run = { name: "Lint checks", conclusion: "failure", started_at: at };
  assert.equal(ciFailing("org/repo", [run], []), false);
  assert.equal(ciFailing("org/other", [run], []), true);
  values.delete("gh_digest_ignored_ci");
});

const pr = (section, author, comments = []) => ({
  section,
  author,
  comments,
  reviews: [],
  title: "A pull request",
  url: "https://github.com/org/repo/pull/1",
});
test("notification baseline emits nothing and default username is usable", () => {
  assert.deepEqual(collectNotificationEvents(null, { prs: {} }), []);
});

test("notification badge excludes activity threads", () => {
  session.teammates = new Set(["team-user"]);
  const base = {
    createdAt: later,
    prAuthor: "outside-author",
    readAt: null,
  };
  assert.equal(
    unreadThreadCount([
      { ...base, id: "needs", prId: "org/repo#1", type: "mentioned" },
      {
        ...base,
        id: "team",
        prId: "org/repo#2",
        actor: "team-user",
        prAuthor: "team-user",
      },
      {
        ...base,
        id: "activity",
        prId: "org/repo#3",
        actor: "outside-user",
      },
    ]),
    2,
  );
});

test("self-assignments stay in activity and do not increase the unread badge", () => {
  const previousUsername = session.USERNAME;
  session.USERNAME = "me";
  try {
    const assignment = {
      id: "self-assignment",
      prId: "org/repo#1",
      type: "assigned",
      actor: "Me",
      preview: "Assigned to @me",
      createdAt: later,
      readAt: null,
    };
    assert.equal(notificationSection(assignment), "activity");
    assert.equal(unreadThreadCount([assignment]), 0);
    assert.equal(
      notificationSection({ ...assignment, actor: "someone-else" }),
      "needs-you",
    );
    assert.equal(
      notificationSection({ ...assignment, actor: null }),
      "needs-you",
    );
  } finally {
    session.USERNAME = previousUsername;
  }
});

test("notification grouping can split mixed PR activity by section", () => {
  const mixed = [
    {
      id: "needs",
      prId: "org/repo#1",
      type: "mentioned",
      createdAt: later,
    },
    {
      id: "activity",
      prId: "org/repo#1",
      type: "comment_on_watched_pr",
      actor: "outside-user",
      createdAt: at,
    },
  ];

  assert.deepEqual(
    notificationGroups(
      mixed.filter((item) => notificationSection(item) === "needs-you"),
    )
      .flat()
      .map((item) => item.id),
    ["needs"],
  );
  assert.deepEqual(
    notificationGroups(
      mixed.filter((item) => notificationSection(item) === "activity"),
    )
      .flat()
      .map((item) => item.id),
    ["activity"],
  );
});

test("pinned notification groups are removed from their original sections", () => {
  const groups = notificationGroups([
    {
      id: "pinned",
      prId: "org/repo#1",
      type: "mentioned",
      pinnedAt: Date.parse(later),
      createdAt: later,
    },
    {
      id: "same-thread",
      prId: "org/repo#1",
      type: "comment_on_watched_pr",
      createdAt: at,
    },
    {
      id: "regular",
      prId: "org/repo#2",
      type: "mentioned",
      createdAt: at,
    },
  ]);

  const sections = partitionNotificationGroups(groups);

  assert.deepEqual(
    sections.pinned.flat().map((item) => item.id),
    ["pinned", "same-thread"],
  );
  assert.deepEqual(
    sections["needs-you"].flat().map((item) => item.id),
    ["regular"],
  );
  assert.deepEqual(sections.activity, []);
});

test("notification actor groups combine repeated comments without losing text", () => {
  const groups = notificationActorGroups([
    {
      id: "new-comment",
      actor: "reviewer",
      type: "comment_on_watched_pr",
      preview: "Newest comment",
      createdAt: later,
    },
    {
      id: "other-comment",
      actor: "other-reviewer",
      type: "comment_on_watched_pr",
      preview: "Other comment",
      createdAt: later,
    },
    {
      id: "old-comment",
      actor: "reviewer",
      type: "comment_on_watched_pr",
      preview: "Older comment",
      createdAt: at,
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups
      .find((group) => group.actor === "reviewer")
      .events.map((event) => event.preview),
    ["Newest comment", "Older comment"],
  );
});

test("empty bot review events are hidden while bot comments remain visible", () => {
  const hiddenReview = {
    id: "empty-review",
    prId: "org/repo#1",
    type: "new_review",
    actor: "claude[bot]",
    isBot: true,
    preview: "",
    createdAt: later,
  };
  const comment = {
    id: "comment",
    prId: "org/repo#1",
    type: "comment_on_my_pr",
    actor: "claude[bot]",
    isBot: true,
    preview: "A useful review comment",
    createdAt: at,
  };

  assert.deepEqual(notificationGroups([hiddenReview, comment]), [[comment]]);
});

test("stored empty review events are removed without relying on bot metadata", () => {
  const emptyReview = {
    id: "empty-review",
    key: "empty-review",
    prId: "org/repo#1",
    type: "new_review",
    createdAt: later,
    preview: "",
  };
  const comment = {
    id: "comment",
    key: "comment",
    prId: "org/repo#1",
    type: "comment_on_my_pr",
    createdAt: at,
    preview: "Useful comment",
  };

  assert.deepEqual(
    normalize("gh_digest_notifications", [emptyReview, comment], []),
    [comment],
  );
});

test("reading notifications removes invalid stored events from local storage", () => {
  const emptyReview = {
    id: "empty-review",
    key: "empty-review",
    prId: "org/repo#1",
    type: "new_review",
    createdAt: later,
    preview: "",
  };
  values.set("gh_digest_notifications", JSON.stringify([emptyReview]));

  assert.deepEqual(read("gh_digest_notifications", []), []);
  assert.equal(values.get("gh_digest_notifications"), "[]");
});

test("empty bot COMMENTED reviews do not create notifications", () => {
  const old = { prs: { own: pr(4, "me") } };
  const fresh = {
    prs: {
      own: {
        ...pr(4, "me"),
        reviews: [
          {
            user: "claude[bot]",
            state: "COMMENTED",
            submittedAt: later,
            preview: "",
          },
        ],
      },
    },
  };

  assert.deepEqual(collectNotificationEvents(old, fresh, "me"), []);
});

test("comment-only reviews with a body notify on my PR", () => {
  const old = { prs: { own: pr(4, "me") } };
  const fresh = {
    prs: {
      own: {
        ...pr(4, "me"),
        reviews: [
          {
            user: "reviewer",
            state: "COMMENTED",
            submittedAt: later,
            preview: "Question about the schema",
          },
        ],
      },
    },
  };
  const events = collectNotificationEvents(old, fresh, "me");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "new_review");
  assert.equal(events[0].actor, "reviewer");
  assert.equal(events[0].preview, "Question about the schema");
});

test("bot comments on my PR need my attention", () => {
  assert.equal(
    notificationSection({
      isBot: true,
      onMyPR: true,
      type: "comment_on_my_pr",
    }),
    "needs-you",
  );
});

test("notifications retain bots on own PRs and exclude bots on watched PRs", () => {
  const comments = [
    { user: "helper[bot]", createdAt: later },
    { user: "human", createdAt: later, replyToUser: "me" },
  ];
  const old = { prs: { own: pr(4, "me"), watched: pr(3, "other") } };
  const fresh = {
    prs: { own: pr(4, "me", comments), watched: pr(3, "other", comments) },
  };
  const events = collectNotificationEvents(old, fresh, "me");
  assert.equal(events.length, 3);
  assert.equal(events.filter((event) => event.isBot).length, 1);
  assert.equal(
    events.filter((event) => event.type === "reply_to_my_comment").length,
    2,
  );
  assert.deepEqual(collectNotificationEvents(fresh, fresh, "me"), []);
});

test("explicit notification username determines reply ownership", () => {
  const old = { prs: { watched: pr(3, "other") } };
  const fresh = {
    prs: {
      watched: pr(3, "other", [
        { user: "human", createdAt: later, replyToUser: "different-user" },
      ]),
    },
  };
  assert.equal(
    collectNotificationEvents(old, fresh, "different-user")[0].type,
    "reply_to_my_comment",
  );
});

test("a merge timestamp does not recreate an old comment notification", () => {
  const mention = {
    id: "thread-1",
    commentId: "comment-1",
    prId: "org/repo#1",
    reason: "mention",
    title: "PR",
    url: "https://github.com/org/repo/pull/1",
    updatedAt: at,
  };
  const old = { prs: {}, mentions: [mention] };
  assert.deepEqual(collectNotificationEvents(old, old, "me"), []);
  const events = collectNotificationEvents(
    old,
    { prs: {}, mentions: [{ ...mention, updatedAt: later }] },
    "me",
  );
  assert.deepEqual(events, []);
});

test("adding comment identity to a legacy snapshot does not recreate an old comment", () => {
  const old = {
    prs: {},
    mentions: [
      {
        id: "thread-1",
        prId: "org/repo#1",
        reason: "mention",
        updatedAt: later,
      },
    ],
  };
  const events = collectNotificationEvents(
    old,
    {
      prs: {},
      mentions: [
        {
          ...old.mentions[0],
          commentId: "comment-1",
          eventAt: at,
          updatedAt: "2026-09-07T12:00:00Z",
          preview: "Old comment",
        },
      ],
    },
    "me",
  );

  assert.deepEqual(events, []);
});

test("a new comment in the same notification thread is new activity", () => {
  const old = {
    prs: {},
    mentions: [
      {
        id: "thread-1",
        commentId: "comment-1",
        prId: "org/repo#1",
        reason: "mention",
        updatedAt: at,
      },
    ],
  };
  const events = collectNotificationEvents(
    old,
    {
      prs: {},
      mentions: [
        {
          ...old.mentions[0],
          commentId: "comment-2",
          eventAt: later,
          updatedAt: later,
          preview: "New comment",
        },
      ],
    },
    "me",
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].createdAt, later);
  assert.equal(events[0].preview, "New comment");
});

test("commented mention events survive tracked snapshots and re-renders", () => {
  const mention = {
    id: "thread-1",
    commentId: "comment-1",
    prId: "org/repo#1",
    reason: "comment",
    title: "PR",
    url: "https://github.com/org/repo/pull/1",
    actor: "reviewer",
    eventAt: later,
    preview: "Review summary",
    commentUrl: "https://github.com/org/repo/pull/1#issuecomment-1",
    updatedAt: later,
  };
  const old = { prs: { "org/repo#1": pr(4, "me") } };
  const fresh = {
    prs: { "org/repo#1": pr(4, "me") },
    mentions: [mention],
  };
  const events = collectNotificationEvents(old, fresh, "me");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "mentioned");
  assert.equal(events[0].preview, "Review summary");
  assert.deepEqual(collectNotificationEvents(fresh, fresh, "me"), []);
});

test("assignment thread updates do not recreate an assignment", () => {
  const mention = {
    id: "assignment",
    prId: "org/repo#1",
    reason: "assign",
    eventAt: at,
    updatedAt: at,
  };
  const old = { prs: {}, mentions: [mention] };
  assert.deepEqual(
    collectNotificationEvents(
      old,
      { prs: {}, mentions: [{ ...mention, updatedAt: later }] },
      "me",
    ),
    [],
  );
  const events = collectNotificationEvents(
    old,
    { prs: {}, mentions: [{ ...mention, eventAt: later, updatedAt: later }] },
    "me",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].createdAt, later);
  assert.deepEqual(
    collectNotificationEvents(
      { prs: {}, mentions: [{ ...mention, eventAt: null, updatedAt: later }] },
      { prs: {}, mentions: [{ ...mention, updatedAt: later }] },
      "me",
    ),
    [],
  );
});

test("refresh repairs missing actors on saved GitHub notifications", () => {
  const saved = {
    key: `assigned:org/repo#1:thread-1:${later}`,
    actor: null,
    readAt: 123,
  };
  const repaired = repairNotificationActors(
    [saved],
    [
      {
        id: "thread-1",
        prId: "org/repo#1",
        reason: "assign",
        updatedAt: later,
        actor: "assigner",
      },
    ],
  );

  assert.deepEqual(repaired, [{ ...saved, actor: "assigner" }]);
});
