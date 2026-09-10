import { session } from "../config.js";
export function latestActivityAt(timestamps) {
  return timestamps.filter(Boolean).sort().pop() || null;
}

export function hasExternalActivitySince(
  lastUserActivityAt,
  reviews,
  comments,
  commits,
) {
  if (!lastUserActivityAt) return false;
  const lastUserActivityMs = new Date(lastUserActivityAt).getTime();
  const happenedAfter = (timestamp) =>
    timestamp && new Date(timestamp).getTime() > lastUserActivityMs;

  const externalReview = reviews.some(
    (review) =>
      review.user?.login !== session.USERNAME &&
      happenedAfter(review.submitted_at),
  );
  const externalComment = comments.some(
    (comment) =>
      comment.user !== session.USERNAME && happenedAfter(comment.createdAt),
  );
  const externalCommit = commits.some((commit) => {
    const actor = commit.author?.login || commit.committer?.login;
    const committedAt =
      commit.commit?.committer?.date || commit.commit?.author?.date;
    return actor !== session.USERNAME && happenedAfter(committedAt);
  });
  return externalReview || externalComment || externalCommit;
}

export function hasReviewOrCommitActivitySince(
  lastUserActivityAt,
  reviews,
  _comments,
  commits,
) {
  if (!lastUserActivityAt) return false;
  const lastUserActivityMs = new Date(lastUserActivityAt).getTime();
  const happenedAfter = (timestamp) =>
    timestamp && new Date(timestamp).getTime() > lastUserActivityMs;

  const externalReview = reviews.some(
    (review) =>
      review.user?.login !== session.USERNAME &&
      review.state !== "COMMENTED" &&
      happenedAfter(review.submitted_at),
  );
  const externalCommit = commits.some((commit) => {
    const actor = commit.author?.login || commit.committer?.login;
    const committedAt =
      commit.commit?.committer?.date || commit.commit?.author?.date;
    return actor !== session.USERNAME && happenedAfter(committedAt);
  });
  return externalReview || externalCommit;
}

export function hasActionableActivitySince(
  lastUserActivityAt,
  latestUserReviewState,
  reviews,
  comments,
  commits,
) {
  if (latestUserReviewState === "APPROVED") {
    return hasReviewOrCommitActivitySince(
      lastUserActivityAt,
      reviews,
      comments,
      commits,
    );
  }
  return hasExternalActivitySince(
    lastUserActivityAt,
    reviews,
    comments,
    commits,
  );
}
export function diff(oldSnap, newSnap) {
  const badges = {};
  if (!oldSnap) return badges; // baseline only on first run
  const oldPRs = oldSnap.prs || {};

  for (const [prId, pr] of Object.entries(newSnap.prs)) {
    const old = oldPRs[prId];

    if (!old) {
      badges[prId] = "NEW";
    } else if (old.section !== pr.section) {
      if (old.updatedAt !== pr.updatedAt) badges[prId] = "UPDATED";
    } else if (
      pr.isDirect &&
      pr.reviewedBefore &&
      old.updatedAt !== pr.updatedAt
    ) {
      badges[prId] = "UPDATED";
    } else if (pr.section === 3) {
      const oldCommentKeys = new Set(
        (old.comments || []).map((c) => `${c.user}:${c.createdAt}`),
      );
      const newComment = (pr.comments || []).find(
        (c) =>
          !oldCommentKeys.has(`${c.user}:${c.createdAt}`) &&
          c.user !== session.USERNAME,
      );
      if (newComment) badges[prId] = "UPDATED";
    } else if (pr.section === 4) {
      const oldReviewKeys = new Set(
        (old.reviews || []).map((r) => `${r.user}:${r.submittedAt}`),
      );
      const newReview = (pr.reviews || []).find(
        (r) =>
          !oldReviewKeys.has(`${r.user}:${r.submittedAt}`) &&
          r.user !== pr.author,
      );
      const oldCommentKeys = new Set(
        (old.comments || []).map((c) => `${c.user}:${c.createdAt}`),
      );
      const newComment = (pr.comments || []).find(
        (c) =>
          !oldCommentKeys.has(`${c.user}:${c.createdAt}`) &&
          c.user !== pr.author,
      );
      if (newReview) badges[prId] = "NEW-REVIEW";
      else if (newComment) badges[prId] = "UPDATED";
    }
  }

  return badges;
}
