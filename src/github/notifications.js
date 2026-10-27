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

async function resolveContext(notification, token) {
  if (
    ["mention", "comment", "team_mention"].includes(notification.reason) &&
    notification.subject?.latest_comment_url
  ) {
    const comment = await ghJson(
      notification.subject.latest_comment_url,
      token,
    );
    return {
      actor: comment.user?.login || null,
      commentId: comment.id == null ? null : String(comment.id),
      eventAt: comment.created_at || null,
      preview: comment.body || "",
      commentUrl: comment.html_url || null,
    };
  }
  const pr = parsePRFromNotification(notification);
  if (!pr) return {};
  if (["mention", "comment", "team_mention"].includes(notification.reason)) {
    const pullRequest = await ghJson(notification.subject.url, token);
    return { actor: pullRequest.user?.login || null };
  }
  const events = await ghJson(
    `/repos/${pr.repo}/issues/${pr.number}/timeline?per_page=100`,
    token,
  );
  const eventTypes =
    notification.reason === "assign"
      ? new Set(["assigned"])
      : new Set(["closed", "merged", "reopened"]);
  const event = [...events]
    .reverse()
    .find(
      (event) =>
        eventTypes.has(event.event) &&
        Date.parse(event.created_at) <= Date.parse(notification.updated_at),
    );
  return {
    actor: event?.actor?.login || null,
    eventAt: event?.created_at || null,
    preview: event
      ? event.event === "assigned"
        ? `Assigned to @${event.assignee?.login || "you"}`
        : `${event.event[0].toUpperCase()}${event.event.slice(1)} the pull request`
      : "",
  };
}

export async function fetchRecentNotifications(token) {
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  const since = new Date(cutoff).toISOString();
  const list = await ghJson(
    `/notifications?all=true&since=${encodeURIComponent(since)}&per_page=100`,
    token,
    { paginate: true },
  );
  const recent = list.filter(
    (n) =>
      Date.parse(n.updated_at) >= cutoff && n.subject?.type === "PullRequest",
  );
  const extraNotifs = recent.filter(
    (n) =>
      ["mention", "comment", "state_change", "assign", "team_mention"].includes(
        n.reason,
      ) && n.subject?.type === "PullRequest",
  );
  const enrichedExtraNotifs = await Promise.all(
    extraNotifs.map(async (notification) => {
      const context = await resolveContext(notification, token).catch(
        () => ({}),
      );
      return { ...notification, ...context };
    }),
  );
  return {
    notifications: recent.filter((n) =>
      ["review_requested", "team_mention"].includes(n.reason),
    ),
    extraNotifs: enrichedExtraNotifs,
  };
}
