import { allRequests } from "./concurrent.js";
import { config, session } from "../config.js";
import { readJSON, writeJSON } from "../storage.js";
import { ghJson } from "./client.js";

export async function getTeammates(token) {
  const cached = readJSON("gh_digest_team_members", {});
  const matching =
    cached.org === config.ORG &&
    JSON.stringify(cached.teams) === JSON.stringify(config.TEAMS) &&
    Array.isArray(cached.members);
  let members;
  if (matching && Date.now() - cached.fetchedAt < 86400000) {
    members = cached.members;
  } else {
    const lists = await allRequests(
      config.TEAMS.map((team) =>
        ghJson(
          `/orgs/${encodeURIComponent(config.ORG)}/teams/${encodeURIComponent(team)}/members?per_page=100`,
          token,
        ),
      ),
    );
    members = [
      ...new Set(lists.flatMap((list) => list.map((member) => member.login))),
    ];
    writeJSON("gh_digest_team_members", {
      org: config.ORG,
      teams: config.TEAMS,
      members,
      fetchedAt: Date.now(),
    });
  }
  const excluded = new Set(
    [...config.EXCLUDED_TEAMMATES, session.USERNAME].map((login) =>
      login.toLowerCase(),
    ),
  );
  return new Set(
    [...members, ...config.EXTRA_TEAMMATES].filter(
      (login) => !excluded.has(login.toLowerCase()),
    ),
  );
}
