import { allRequests } from "../github/concurrent.js";
import { config } from "../config.js";
import { readJSON } from "../storage.js";
import { ghJson } from "../github/client.js";

export function isIgnoredCiCheck(
  repo,
  name,
  rules = readJSON("gh_digest_ignored_ci", config.DEFAULT_IGNORED_CI),
) {
  return rules.some((rule) => {
    const scope = String(rule?.repo || "*")
      .trim()
      .toLowerCase();
    const pattern = String(rule?.pattern || "")
      .trim()
      .toLowerCase();
    return (
      pattern &&
      (scope === "*" || scope === repo.toLowerCase()) &&
      String(name || "")
        .toLowerCase()
        .includes(pattern)
    );
  });
}

export function ciFailing(repo, runs, statuses) {
  const latest = new Map();
  for (const run of runs) {
    const key = `${run.app?.id ?? "none"}:${run.name}`;
    const previous = latest.get(key);
    const time = (entry) =>
      new Date(entry.started_at || entry.completed_at || 0).getTime();
    if (!previous || time(run) > time(previous)) latest.set(key, run);
  }
  return (
    [...latest.values()].some(
      (run) =>
        !isIgnoredCiCheck(repo, run.name) &&
        ["failure", "timed_out", "action_required"].includes(run.conclusion),
    ) ||
    statuses.some(
      (status) =>
        !isIgnoredCiCheck(repo, status.context) &&
        ["failure", "error"].includes(status.state),
    )
  );
}

export async function checkCi(repo, sha, token) {
  if (!sha) throw new Error(`No head commit available for ${repo}`);
  const [checks, status] = await allRequests([
    ghJson(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`, token),
    ghJson(`/repos/${repo}/commits/${sha}/status?per_page=100`, token),
  ]);
  return ciFailing(repo, checks.check_runs || [], status.statuses || []);
}
