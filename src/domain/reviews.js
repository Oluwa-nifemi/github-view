import { snippet } from "./text.js";
export function normalizeReviews(rawReviews) {
  return rawReviews.map((review) => ({
    user: review.user?.login,
    state: review.state,
    submittedAt: review.submitted_at,
    commitId: review.commit_id,
    preview: snippet(review.body, 160),
  }));
}

export function latestNonCommentReviewsByReviewer(
  reviews,
  authorLogin,
  pendingLogins,
) {
  const rerequested = new Set(pendingLogins || []);
  const latestByReviewer = new Map();
  for (const review of reviews) {
    if (review.user === authorLogin) continue;
    if (review.state === "COMMENTED") continue;
    if (rerequested.has(review.user)) continue;
    const existing = latestByReviewer.get(review.user);
    if (
      !existing ||
      new Date(review.submittedAt) > new Date(existing.submittedAt)
    ) {
      latestByReviewer.set(review.user, review);
    }
  }
  return latestByReviewer;
}

export function isApprovalSufficient(pr, hasApproval) {
  if (!hasApproval) return false;
  if (pr.reviewDecision === undefined) return !pr.pendingReviewers;
  return pr.reviewDecision === "APPROVED" || pr.reviewDecision === null;
}

export function classifyMyPR(pr) {
  if (pr.ciFailing) return "ci_failing";
  const latestByReviewer = latestNonCommentReviewsByReviewer(
    pr.reviews,
    pr.author,
    pr.pendingReviewerLogins,
  );
  const states = [...latestByReviewer.values()].map((r) => r.state);
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (isApprovalSufficient(pr, states.includes("APPROVED"))) return "approved";
  return "awaiting";
}

export function isHandledByReview(pr) {
  if (pr.isDirect || pr.needsAttention) return false;
  const latestByReviewer = latestNonCommentReviewsByReviewer(
    pr.reviews,
    pr.author,
    pr.pendingReviewerLogins,
  );
  const states = [...latestByReviewer.values()].map((review) => review.state);
  return states.includes("APPROVED") && !states.includes("CHANGES_REQUESTED");
}
