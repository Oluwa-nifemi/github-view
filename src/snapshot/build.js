import { allRequests } from "../github/concurrent.js";
import { config, session } from "../config.js";
import {
  search,
  searchByTeammates,
  repoFromIssue,
  getReviewDecisions,
} from "../github/search.js";
import { getTeammates } from "../github/teammates.js";
import { fetchRecentNotifications } from "../github/notifications.js";
import { enrichRequested } from "./requested.js";
import { enrichAgent } from "./agent.js";
import { enrichMine } from "./mine.js";
import { enrichHandled } from "./handled.js";
import { enrichEngaged } from "./engaged.js";
import { enrichTeammateOpen } from "./teammate-open.js";
import { collectMyItems, excludeOwnedReviewItems } from "./sources.js";
export async function buildSnapshot(
  token,
  cachedSnapshot,
  onProgress = () => {},
) {
  const scope = JSON.stringify({
    ...config,
    IGNORED_REPOS: [...config.IGNORED_REPOS],
    username: session.USERNAME,
  });
  session.teammates = await getTeammates(token);
  const cachedPRs =
    cachedSnapshot?.version === 4 && cachedSnapshot.scope === scope
      ? cachedSnapshot.prs
      : {};

  const orgFilter = config.ORG ? ` org:${config.ORG}` : "";
  const reviewQ = `is:pr is:open archived:false review-requested:${session.USERNAME}${orgFilter}`;
  const authoredQ = `is:pr is:open archived:false author:${session.USERNAME}${orgFilter}`;
  const assignedQ = `is:pr is:open archived:false assignee:${session.USERNAME}${orgFilter}`;

  const teammateLoginsForSearch = [...session.teammates].filter(
    (login) => login !== session.USERNAME,
  );
  const teammateReviewSearches = searchByTeammates(
    "review-requested",
    teammateLoginsForSearch,
    token,
  );
  const teamReviewSearch =
    config.ORG && config.TEAMS.length
      ? searchByTeammates(
          "team-review-requested",
          config.TEAMS.map((team) => `${config.ORG}/${team}`),
          token,
        )
      : Promise.resolve([]);

  const [
    reviewItems,
    teamReviewItems,
    authoredItems,
    assignedItems,
    teammateReviewItems,
  ] = await allRequests([
    search(reviewQ, token),
    teamReviewSearch,
    search(authoredQ, token),
    search(assignedQ, token),
    teammateReviewSearches,
  ]);

  // Merge team-review-requested results into reviewItems (dedupe by PR id).
  // Teammate-authored PRs are kept here: both direct and team review requests
  // land in section 3 (isDirect just adds a label). Section 7's dedup skips
  // anything already classified, so they won't double-appear under "Teammates' Open PRs".
  const reviewItemsMap = new Map();
  for (const item of [...reviewItems, ...teamReviewItems]) {
    const repo = repoFromIssue(item);
    if (!repo) continue;
    reviewItemsMap.set(`${repo}#${item.number}`, item);
  }
  const allReviewItems = [...reviewItemsMap.values()];

  // Agent-bot-authored PRs where a teammate has been asked to review.
  // Can't search `author:<bot>` directly (GitHub rejects bot accounts),
  // so we derive from session.teammates' review-requested lists.
  const agentBotItemsMap = new Map();
  if (config.AGENT_BOT_LOGIN) {
    for (const item of teammateReviewItems) {
      if (item.user?.login !== config.AGENT_BOT_LOGIN) continue;
      const repo = repoFromIssue(item);
      if (!repo) continue;
      agentBotItemsMap.set(`${repo}#${item.number}`, item);
    }
  }
  const agentBotItems = [...agentBotItemsMap.values()];

  // Ownership wins over source classification. Recover authored PRs from any
  // source if GitHub's authored search temporarily omits them.
  const myItems = collectMyItems({
    username: session.USERNAME,
    agentBotLogin: config.AGENT_BOT_LOGIN,
    sources: [authoredItems, assignedItems, allReviewItems, agentBotItems],
  });
  const myItemsMap = new Map();
  for (const item of myItems) {
    const repo = repoFromIssue(item);
    if (!repo) continue;
    myItemsMap.set(`${repo}#${item.number}`, item);
  }
  const reviewDecisions = await getReviewDecisions(myItems, token);

  const prs = {};

  const ctx = {
    token,
    cachedPRs,
    prs,
    allReviewItems: excludeOwnedReviewItems(allReviewItems, myItemsMap),
    agentBotItems,
    myItemsMap,
    myItems,
    reviewDecisions,
    notifications: [],
  };
  await enrichRequested(ctx);
  await enrichAgent(ctx);
  await enrichMine(ctx);
  // Show primary PRs on first load without committing an incomplete cache.
  onProgress({
    version: 4,
    scope,
    prs: { ...prs },
    mentions: [],
    partial: true,
  });
  const { notifications, extraNotifs } = await fetchRecentNotifications(token);
  ctx.notifications = notifications;
  await enrichEngaged(ctx);
  await enrichHandled(ctx);
  await enrichTeammateOpen(ctx);
  // Normalize extra notifications for storage (compact shape)
  const mentions = extraNotifs
    .map((n) => {
      const urlMatch = (n.subject?.url || "").match(
        /\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/,
      );
      const repo = urlMatch ? urlMatch[1] : null;
      const number = urlMatch ? parseInt(urlMatch[2], 10) : null;
      return {
        id: n.id,
        reason: n.reason,
        repo,
        number,
        prId: repo && number ? `${repo}#${number}` : null,
        title: n.subject?.title || "",
        actor: n.actor || null,
        commentId: n.commentId || null,
        eventAt: n.eventAt || null,
        preview: n.preview || "",
        commentUrl: n.commentUrl || null,
        updatedAt: n.updated_at,
        url:
          repo && number ? `https://github.com/${repo}/pull/${number}` : null,
      };
    })
    .filter((m) => m.prId && !config.IGNORED_REPOS.has(m.repo));

  return {
    version: 4,
    scope,
    prs,
    mentions,
    timestamp: new Date().toISOString(),
  };
}
