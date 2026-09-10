import { repoFromIssue } from "../github/search.js";

const sameLogin = (left, right) =>
  !!left && !!right && left.toLowerCase() === right.toLowerCase();

export function collectMyItems({ username, agentBotLogin, sources }) {
  const items = new Map();
  for (const item of sources.flat()) {
    const repo = repoFromIssue(item);
    if (!repo) continue;
    const authoredByUser = sameLogin(item.user?.login, username);
    const assignedAgentPR =
      sameLogin(item.user?.login, agentBotLogin) &&
      (item.assignees || []).some((assignee) =>
        sameLogin(assignee.login, username),
      );
    if (authoredByUser || assignedAgentPR)
      items.set(`${repo}#${item.number}`, item);
  }
  return [...items.values()];
}

export function excludeOwnedReviewItems(reviewItems, myItemsMap) {
  return reviewItems.filter((item) => {
    const repo = repoFromIssue(item);
    return !repo || !myItemsMap.has(`${repo}#${item.number}`);
  });
}
