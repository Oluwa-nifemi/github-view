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

export async function fetchRelevantNotifications(token) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const list = await ghJson(
    `/notifications?all=true&since=${encodeURIComponent(since)}&per_page=50`,
    token,
  );
  return list.filter(
    (n) =>
      ["review_requested", "team_mention"].includes(n.reason) &&
      n.subject?.type === "PullRequest",
  );
}

export async function fetchExtraNotifications(token) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const list = await ghJson(
    `/notifications?all=true&since=${encodeURIComponent(since)}&per_page=50`,
    token,
  );
  return list.filter(
    (n) =>
      ["mention", "comment", "state_change", "assign", "team_mention"].includes(
        n.reason,
      ) && n.subject?.type === "PullRequest",
  );
}
