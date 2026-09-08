import { normalizeComments } from "../domain/comments.js";
import { allRequests } from "../github/concurrent.js";
import { session } from "../config.js";
import { ghJson } from "../github/client.js";
import { repoFromIssue } from "../github/search.js";
import { buildPRBase, applyCachedPR } from "./model.js";
import { normalizeReviews } from "../domain/reviews.js";

export async function enrichRequested({
  allReviewItems,
  cachedPRs,
  prs,
  token,
}) {
  await allRequests(
    allReviewItems.map(async (item) => {
      const repo = repoFromIssue(item);
      if (!repo) return;
      const prId = `${repo}#${item.number}`;

      // Cache fast-path: if the PR is unchanged and we already enriched it as
      // sections 1/2/3, reuse — its reviews/requested_reviewers can't have changed
      // without updated_at bumping.
      const cached = cachedPRs[prId];
      // Skip fast-path if cached version pre-dates the teammate-approved
      // re-routing: those entries may still say section 1 when current logic
      // would send them to section 5.
      const cachedTeammateApproved =
        cached &&
        (cached.reviews || []).some(
          (r) =>
            r.user &&
            r.user !== session.USERNAME &&
            r.state === "APPROVED" &&
            session.teammates.has(r.user),
        );
      const cachedUserReviews = (cached?.reviews || [])
        .filter(
          (review) =>
            review.user === session.USERNAME && review.state !== "COMMENTED",
        )
        .sort(
          (leftReview, rightReview) =>
            new Date(rightReview.submittedAt) -
            new Date(leftReview.submittedAt),
        );
      const cachedLastUserReview = cachedUserReviews[0] || null;
      const cachedUserApproved = cachedLastUserReview?.state === "APPROVED";
      const cachedUserReviewed = !!cachedLastUserReview;
      const needsRerouteRecheck =
        (cachedTeammateApproved && cached.section !== 5) ||
        (cachedUserApproved && cached.section !== 5) ||
        (cached?.isDirect && cached.section !== 3);
      if (
        cached &&
        cached.updatedAt === item.updated_at &&
        [1, 2, 3, 5].includes(cached.section) &&
        !needsRerouteRecheck &&
        cached.isDraft !== undefined &&
        cached.reviewedBefore !== undefined &&
        cached.comments !== undefined &&
        cached.commentsV === 2 &&
        cached.additions !== undefined
      ) {
        prs[prId] = applyCachedPR(cached, item.title);
        return;
      }

      const [reviews, requested, prDetail, issueComments, reviewComments] =
        await allRequests([
          ghJson(
            `/repos/${repo}/pulls/${item.number}/reviews?per_page=100`,
            token,
          ),
          ghJson(
            `/repos/${repo}/pulls/${item.number}/requested_reviewers`,
            token,
          ),
          ghJson(`/repos/${repo}/pulls/${item.number}`, token),
          ghJson(
            `/repos/${repo}/issues/${item.number}/comments?per_page=100`,
            token,
          ),
          ghJson(
            `/repos/${repo}/pulls/${item.number}/comments?per_page=100`,
            token,
          ),
        ]);

      const comments = normalizeComments(issueComments, reviewComments);
      const isDirect = (requested.users || []).some(
        (u) => u.login === session.USERNAME,
      );
      const isTeam = (requested.teams || []).length > 0;
      const userReviews = reviews
        .filter(
          (review) =>
            review.user?.login === session.USERNAME &&
            review.state !== "COMMENTED",
        )
        .sort(
          (leftReview, rightReview) =>
            new Date(rightReview.submitted_at) -
            new Date(leftReview.submitted_at),
        );
      const lastUserReview = userReviews[0] || null;
      const userApproved = lastUserReview?.state === "APPROVED";
      // Latest review state per teammate (ignore your own + comment-only reviews)
      const latestTeammateReviews = new Map();
      for (const review of reviews) {
        const login = review.user?.login;
        if (
          !login ||
          login === session.USERNAME ||
          !session.teammates.has(login)
        )
          continue;
        if (review.state === "COMMENTED") continue;
        const existing = latestTeammateReviews.get(login);
        if (
          !existing ||
          new Date(review.submitted_at) > new Date(existing.submitted_at)
        ) {
          latestTeammateReviews.set(login, review);
        }
      }
      const teammateApprovers = [...latestTeammateReviews.values()]
        .filter((r) => r.state === "APPROVED")
        .map((r) => r.user.login);
      const teammateCovered =
        teammateApprovers.length > 0 &&
        ![...latestTeammateReviews.values()].some(
          (r) => r.state === "CHANGES_REQUESTED",
        );
      // Personal ("isDirect") review requests no longer get their own section —
      // they render inside Team Requests with a label (see reviewChips).
      const section =
        !isDirect && (userApproved || teammateCovered)
          ? 5 // you or a teammate approved — treat as handled
          : 3;
      prs[prId] = {
        ...buildPRBase(prId, repo, section, item, prDetail),
        headSha: prDetail.head?.sha || null,
        isDirect,
        isTeam,
        pendingReviewerLogins: (requested.users || []).map(
          (user) => user.login,
        ),
        ...(section === 5
          ? {
              youReviewed: !!lastUserReview,
              teammateReviewers: teammateApprovers,
            }
          : {}),
        lastUserReviewAt: lastUserReview?.submitted_at || null,
        reviewedBefore: !!lastUserReview,
        reviews: normalizeReviews(reviews),
        comments,
        commentsV: 2,
      };
    }),
  );
}
