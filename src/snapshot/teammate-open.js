import { config, session } from "../config.js";

import { repoFromIssue, searchByTeammates } from "../github/search.js";
import { buildPRBase } from "./model.js";

export async function enrichTeammateOpen({ prs, token }) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const teammateLogins = [...session.teammates].filter(
    (login) => login !== session.USERNAME,
  );
  const teammateItems = await searchByTeammates(
    "author",
    teammateLogins,
    token,
    `updated:>=${fourteenDaysAgo}`,
  );
  for (const item of teammateItems) {
    const repo = repoFromIssue(item);
    if (!repo) continue;
    const prId = `${repo}#${item.number}`;
    if (prs[prId]) continue; // already covered by an earlier section
    prs[prId] = {
      ...buildPRBase(prId, repo, 7, item, null),
      authorIsTeammate: true, // section 7 is session.teammates-only by construction
      reviews: [],
    };
  }

  // Agent-bot-authored PRs assigned to a teammate also belong in section 7.
  // GitHub rejects `author:<bot>` in search, so we search by
  // `assignee:<teammate>` across all session.teammates and filter for agent bot authorship.
  const agentBotAssignedToTeammate = await searchByTeammates(
    "assignee",
    teammateLogins,
    token,
    `updated:>=${fourteenDaysAgo}`,
  );
  for (const item of agentBotAssignedToTeammate) {
    if (item.user?.login !== config.AGENT_BOT_LOGIN) continue;
    const repo = repoFromIssue(item);
    if (!repo) continue;
    const prId = `${repo}#${item.number}`;
    if (prs[prId]) continue; // already covered by an earlier section
    prs[prId] = {
      ...buildPRBase(prId, repo, 7, item, null),
      authorIsTeammate: false,
      reviews: [],
    };
  }
}
