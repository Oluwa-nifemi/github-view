import { allRequests } from "../github/concurrent.js";
import { session } from "../config.js";
import { ghJson } from "../github/client.js";
import { repoFromIssue } from "../github/search.js";
import { buildPRBase, applyCachedPR } from "./model.js";
import { normalizeReviews } from "../domain/reviews.js";

export async function enrichAgent({
  agentBotItems,
  cachedPRs,
  prs,
  myItemsMap,
  token,
}) {
  await allRequests(
    agentBotItems.map(async (item) => {
      const repo = repoFromIssue(item);
      if (!repo) return;
      const prId = `${repo}#${item.number}`;
      if (prs[prId]) return;
      if (myItemsMap.has(prId)) return;

      const cached = cachedPRs[prId];
      if (
        cached &&
        cached.updatedAt === item.updated_at &&
        cached.section === 3 &&
        cached.additions !== undefined
      ) {
        prs[prId] = applyCachedPR(cached, item.title);
        return;
      }

      const prDetail = await ghJson(
        `/repos/${repo}/pulls/${item.number}`,
        token,
      );
      const requestedLogins = (prDetail.requested_reviewers || []).map(
        (u) => u.login,
      );
      const assigneeLogins = (prDetail.assignees || []).map((u) => u.login);
      const teammateRequested = requestedLogins.some((login) =>
        session.teammates.has(login),
      );
      const teammateAssigned = assigneeLogins.some((login) =>
        session.teammates.has(login),
      );
      if (!teammateRequested && !teammateAssigned) return;
      const reviews = await ghJson(
        `/repos/${repo}/pulls/${item.number}/reviews?per_page=100`,
        token,
      );
      prs[prId] = {
        ...buildPRBase(prId, repo, 3, item, prDetail),
        authorIsTeammate: false, // agent bot is never a teammate
        isDirect: false,
        isTeam: false,
        lastUserReviewAt: null,
        reviews: normalizeReviews(reviews),
      };
    }),
  );
}
