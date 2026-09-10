import { normalizeComments } from "../domain/comments.js";
import { allRequests } from "../github/concurrent.js";
import { config, session } from "../config.js";
import { ghJson } from "../github/client.js";

import { buildPRBase, applyCachedPR } from "./model.js";
import { normalizeReviews } from "../domain/reviews.js";
import {
  latestActivityAt,
  hasExternalActivitySince,
  hasActionableActivitySince,
} from "../domain/activity.js";

import { parsePRFromNotification } from "../github/notifications.js";
export async function enrichHandled({ notifications, cachedPRs, prs, token }) {
  const handledCandidates = new Map();
  for (const notification of notifications) {
    const parsed = parsePRFromNotification(notification);
    if (!parsed) continue;
    const prId = `${parsed.repo}#${parsed.number}`;
    if (prs[prId]) continue; // already covered by primary search
    if (handledCandidates.has(prId)) continue;
    handledCandidates.set(prId, parsed);
  }

  await allRequests(
    [...handledCandidates.values()].map(async ({ repo, number }) => {
      const prId = `${repo}#${number}`;

      // Need prDetail to know current state + updated_at — can't skip this
      const prDetail = await ghJson(`/repos/${repo}/pulls/${number}`, token);
      if (prDetail.state !== "open" || prDetail.draft) return;
      if (prDetail.user?.login === session.USERNAME) return; // your own PR, shouldn't land here

      // If the team is still a requested reviewer, the primary search just missed
      // this PR (e.g. GitHub search lag) — treat it as a pending team request (section 3)
      // rather than assuming it was already handled.
      const teamStillRequested = (prDetail.requested_teams || []).some((t) =>
        config.TEAMS.includes(t.slug),
      );
      const isDirect = (prDetail.requested_reviewers || []).some(
        (u) => u.login === session.USERNAME,
      );

      if (teamStillRequested || isDirect) {
        const reviews = await ghJson(
          `/repos/${repo}/pulls/${number}/reviews?per_page=100`,
          token,
        );
        prs[prId] = {
          ...buildPRBase(prId, repo, 3, null, prDetail),
          isDirect,
          isTeam: teamStillRequested,
          lastUserReviewAt: null,
          reviews: normalizeReviews(reviews),
        };
        return;
      }

      // Cache fast-path: if updated_at matches, reviews can't have changed
      const cached = cachedPRs[prId];
      if (
        cached &&
        cached.updatedAt === prDetail.updated_at &&
        cached.section === 5 &&
        cached.comments !== undefined &&
        cached.commentsV === 2 &&
        cached.lastUserActivityAt !== undefined &&
        cached.externalActivityAfterUser !== undefined &&
        cached.additions !== undefined
      ) {
        prs[prId] = applyCachedPR(cached, prDetail.title);
        return;
      }

      const [reviews, issueComments, reviewComments, commits] =
        await allRequests([
          ghJson(`/repos/${repo}/pulls/${number}/reviews?per_page=100`, token),
          ghJson(
            `/repos/${repo}/issues/${number}/comments?per_page=100`,
            token,
          ),
          ghJson(`/repos/${repo}/pulls/${number}/comments?per_page=100`, token),
          ghJson(`/repos/${repo}/pulls/${number}/commits?per_page=100`, token),
        ]);

      const comments = normalizeComments(issueComments, reviewComments);
      const youReviewed = reviews.some(
        (r) => r.user?.login === session.USERNAME,
      );
      const teammateReviewers = [
        ...new Set(
          reviews
            .filter(
              (r) =>
                r.user?.login &&
                r.user.login !== session.USERNAME &&
                session.teammates.has(r.user.login),
            )
            .map((r) => r.user.login),
        ),
      ];

      const lastUserActivityAt = latestActivityAt([
        ...reviews
          .filter((review) => review.user?.login === session.USERNAME)
          .map((review) => review.submitted_at),
        ...comments
          .filter((comment) => comment.user === session.USERNAME)
          .map((comment) => comment.createdAt),
      ]);
      const externalActivityAfterUser = hasExternalActivitySince(
        lastUserActivityAt,
        reviews,
        comments,
        commits,
      );
      const latestUserReview =
        reviews
          .filter(
            (review) =>
              review.user?.login === session.USERNAME &&
              review.state !== "COMMENTED",
          )
          .sort(
            (leftReview, rightReview) =>
              new Date(rightReview.submitted_at) -
              new Date(leftReview.submitted_at),
          )[0] || null;
      const lastUserReviewAt = latestActivityAt(
        reviews
          .filter((r) => r.user?.login === session.USERNAME && r.submitted_at)
          .map((r) => r.submitted_at),
      );
      const changedSinceTouched =
        youReviewed &&
        hasActionableActivitySince(
          lastUserActivityAt,
          latestUserReview?.state,
          reviews,
          comments,
          commits,
        );

      if (changedSinceTouched) {
        prs[prId] = {
          ...buildPRBase(prId, repo, 3, null, prDetail),
          isDirect: false,
          isTeam: false,
          lastUserReviewAt,
          reviewedBefore: true,
          reviews: normalizeReviews(reviews),
          comments,
          commentsV: 2,
          lastUserActivityAt,
          needsAttention: true,
          externalActivityAfterUser,
        };
        return;
      }

      prs[prId] = {
        ...buildPRBase(prId, repo, 5, null, prDetail),
        youReviewed,
        teammateReviewers,
        reviews: normalizeReviews(reviews),
        comments,
        commentsV: 2,
        lastUserActivityAt,
        needsAttention: false,
        externalActivityAfterUser,
      };
    }),
  );
}
