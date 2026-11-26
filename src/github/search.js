import { config } from "../config.js";
import { ghGraphQL } from "./client.js";

async function searchPullRequests(query, token) {
  const nodes = [];
  let cursor = null;
  do {
    const gql = `{ search(query: ${JSON.stringify(query)}, type: ISSUE, first: 100, after: ${JSON.stringify(cursor)}) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest {
      number title url updatedAt createdAt isDraft
      author { login }
      assignees(first: 100) { nodes { login } }
      repository { nameWithOwner }
    } }
  } }`;
    const data = await ghGraphQL(gql, token);
    if (data.search.issueCount > 1000)
      throw new Error(
        "GitHub search exceeds 1,000 results. Narrow the organization or team scope.",
      );
    nodes.push(...(data.search.nodes || []).filter((node) => node.repository));
    const next = data.search.pageInfo;
    if (next?.hasNextPage && (!next.endCursor || next.endCursor === cursor))
      throw new Error("Invalid GitHub search cursor");
    cursor = next?.hasNextPage ? next.endCursor : null;
  } while (cursor);
  return nodes.map((node) => ({
    number: node.number,
    title: node.title,
    html_url: node.url,
    updated_at: node.updatedAt,
    created_at: node.createdAt,
    draft: node.isDraft,
    user: { login: node.author?.login || null },
    assignees: (node.assignees?.nodes || []).map((user) => ({
      login: user.login,
    })),
    repository_url: `https://api.github.com/repos/${node.repository.nameWithOwner}`,
  }));
}

export async function search(query, token) {
  const ignoredReposQuery = [...config.IGNORED_REPOS]
    .map((repo) => `-repo:${repo}`)
    .join(" ");
  return searchPullRequests(`${query} ${ignoredReposQuery}`.trim(), token);
}
export async function searchByTeammates(qualifier, logins, token, extraQ = "") {
  if (logins.length === 0) return [];
  const qualifierStr = logins.map((login) => `${qualifier}:${login}`).join(" ");
  const ignoredReposQuery = [...config.IGNORED_REPOS]
    .map((repo) => `-repo:${repo}`)
    .join(" ");
  const orgQ = config.ORG ? `org:${config.ORG}` : "";
  const q =
    `is:pr is:open archived:false ${orgQ} ${qualifierStr} ${extraQ} ${ignoredReposQuery}`
      .replace(/\s+/g, " ")
      .trim();
  return searchPullRequests(q, token);
}
export function repoFromIssue(item) {
  const match = item.repository_url.match(/\/repos\/(.+)$/);
  return match ? match[1] : null;
}

export async function getReviewDecisions(items, token) {
  const entries = items
    .map((item, index) => {
      const repo = repoFromIssue(item);
      if (!repo) return null;
      const [owner, name] = repo.split("/");
      return { alias: `pr${index}`, repo, number: item.number, owner, name };
    })
    .filter(Boolean);
  if (!entries.length) return new Map();
  const fields = entries
    .map(
      (entry) =>
        `${entry.alias}: repository(owner: ${JSON.stringify(entry.owner)}, name: ${JSON.stringify(entry.name)}) {
      pullRequest(number: ${entry.number}) { reviewDecision }
    }`,
    )
    .join("\n");
  const data = await ghGraphQL(`query { ${fields} }`, token);
  return new Map(
    entries
      .filter((entry) => data[entry.alias]?.pullRequest)
      .map((entry) => [
        `${entry.repo}#${entry.number}`,
        data[entry.alias].pullRequest.reviewDecision,
      ]),
  );
}
