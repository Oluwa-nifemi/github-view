import { normalizeComments } from "../domain/comments.js";
import { allRequests } from "../github/concurrent.js";
import { config, session } from "../config.js";
import { ghJson } from "../github/client.js";
import { repoFromIssue, search } from "../github/search.js";
import { buildPRBase, applyCachedPR } from "./model.js";
import { normalizeReviews } from "../domain/reviews.js";
import {
  latestActivityAt,
  hasExternalActivitySince,
  hasActionableActivitySince,
} from "../domain/activity.js";

export async function enrichEngaged({ cachedPRs, prs, token }) {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const orgFilter = config.ORG ? ` org:${config.ORG}` : "";
  const engagedQ = `is:pr is:open archived:false commenter:${session.USERNAME}${orgFilter} updated:>=${oneMonthAgo}`;
  const engagedItems = await search(engagedQ, token);

  await allRequests(
    engagedItems.map(async (item) => {
      const repo = repoFromIssue(item);
      if (!repo) return;
      const prId = `${repo}#${item.number}`;
      if (prs[prId]) return; // already covered by an earlier section

      const cached = cachedPRs[prId];
      if (
        cached &&
        cached.updatedAt === item.updated_at &&
        [3, 6].includes(cached.section) &&
        cached.comments !== undefined &&
        cached.commentsV === 2 &&
        cached.lastUserActivityAt !== undefined &&
        cached.needsAttention !== undefined &&
        cached.externalActivityAfterUser !== undefined &&
        cached.additions !== undefined
      ) {
        prs[prId] = applyCachedPR(cached, item.title);
        return;
      }

      const [reviews, prDetail, issueComments, reviewComments, commits] =
        await allRequests([
          ghJson(
            `/repos/${repo}/pulls/${item.number}/reviews?per_page=100`,
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
          ghJson(
            `/repos/${repo}/pulls/${item.number}/commits?per_page=100`,
            token,
          ),
        ]);
      if (prDetail.state !== "open" || prDetail.draft) return;

      const comments = normalizeComments(issueComments, reviewComments);
      const userCommentTimes = comments
        .filter((comment) => comment.user === session.USERNAME)
        .map((comment) => comment.createdAt);
      const userReviewTimes = reviews
        .filter(
          (review) =>
            review.user?.login === session.USERNAME && review.submitted_at,
        )
        .map((review) => review.submitted_at);
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
      const lastUserActivityAt = latestActivityAt([
        ...userCommentTimes,
        ...userReviewTimes,
      ]);
      const externalActivityAfterUser = hasExternalActivitySince(
        lastUserActivityAt,
        reviews,
        comments,
        commits,
      );
      const needsAttention = hasActionableActivitySince(
        lastUserActivityAt,
        latestUserReview?.state,
        reviews,
        comments,
        commits,
      );
      const section = needsAttention ? 3 : 6;

      prs[prId] = {
        ...buildPRBase(prId, repo, section, item, prDetail),
        isDirect: false,
        isTeam: false,
        reviewedBefore: !!lastUserActivityAt,
        reviews: normalizeReviews(reviews),
        comments,
        commentsV: 2,
        lastUserActivityAt,
        needsAttention,
        externalActivityAfterUser,
      };
    }),
  );
}
