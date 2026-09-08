import { normalizeComments } from "../domain/comments.js";
import { allRequests } from "../github/concurrent.js";
import { ghJson } from "../github/client.js";
import { repoFromIssue } from "../github/search.js";
import { buildPRBase } from "./model.js";
import { normalizeReviews } from "../domain/reviews.js";

import { checkCi } from "./ci.js";
export async function enrichMine({
  myItems,
  cachedPRs,
  prs,
  reviewDecisions,
  token,
}) {
  // Enrich your own PRs concurrently

  await allRequests(
    myItems.map(async (item) => {
      const repo = repoFromIssue(item);
      if (!repo) return;
      const prId = `${repo}#${item.number}`;

      // Cache fast-path: if updated_at hasn't bumped, reviews + comments + head SHA unchanged.
      // CI can change independently though — always re-check.
      const cached = cachedPRs[prId];
      if (
        cached &&
        cached.updatedAt === item.updated_at &&
        cached.section === 4 &&
        cached.headSha &&
        cached.pendingReviewers !== undefined &&
        cached.pendingReviewerLogins !== undefined &&
        cached.comments !== undefined &&
        cached.commentsV === 2 &&
        cached.additions !== undefined &&
        cached.reviewDecision !== undefined
      ) {
        const ciFailing = await checkCi(repo, cached.headSha, token);
        const reviewDecision = reviewDecisions.has(prId)
          ? reviewDecisions.get(prId)
          : cached.reviewDecision;
        prs[prId] = {
          ...cached,
          title: item.title,
          ciFailing,
          reviewDecision,
          isDraft: !!item.draft,
        };
        return;
      }

      const [reviews, prDetail, issueComments, reviewComments] =
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
        ]);
      const sha = prDetail.head?.sha;
      const ciFailing = await checkCi(repo, sha, token);
      const pendingReviewerLogins = (prDetail.requested_reviewers || []).map(
        (u) => u.login,
      );
      const pendingReviewers =
        pendingReviewerLogins.length + (prDetail.requested_teams || []).length;

      const comments = normalizeComments(issueComments, reviewComments);
      prs[prId] = {
        ...buildPRBase(prId, repo, 4, item, prDetail),
        headSha: sha,
        pendingReviewers,
        pendingReviewerLogins,
        reviewDecision: reviewDecisions.has(prId)
          ? reviewDecisions.get(prId)
          : undefined,
        reviews: normalizeReviews(reviews),
        comments,
        commentsV: 2,
        ciFailing,
      };
    }),
  );
}
