import { config } from "../config.js";
import { ghJson } from "./client.js";
export function parsePRFromNotification(notification) {
  if (notification.subject?.type !== "PullRequest") return null;
  const url = notification.subject?.url || "";
  const match = url.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/);
  if (!match) return null;
  const repo = match[1];
  if (!repo.startsWith(`${config.ORG}/`)) return null;
  if (config.IGNORED_REPOS.has(repo)) return null;
  return { repo, number: parseInt(match[2], 10) };
}

export async function fetchRecentNotifications(token) {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  const since = new Date(cutoff).toISOString();
  const list = await ghJson(
    `/notifications?all=true&since=${encodeURIComponent(since)}&per_page=100`,
    token,
    { paginate: false },
  );
  const recent = list
    .slice(0, 100)
    .filter(
      (n) =>
        Date.parse(n.updated_at) >= cutoff && n.subject?.type === "PullRequest",
    );
  return {
    notifications: recent.filter((n) =>
      ["review_requested", "team_mention"].includes(n.reason),
    ),
    extraNotifs: recent.filter(
      (n) =>
        [
          "mention",
          "comment",
          "state_change",
          "assign",
          "team_mention",
        ].includes(n.reason) && n.subject?.type === "PullRequest",
    ),
  };
}
