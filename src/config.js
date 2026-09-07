import { readJSON } from "./storage.js";

const defaults = {
  extraTeammates: ["saksam760", "nataliadeluna"],
  excludedTeammates: ["sophiebosio"],
  agentBotLogin: "Claudette2-0",
  defaultIgnoredCi: [
    { repo: "*", pattern: "osv" },
    {
      repo: "ardoq/ardoq-packages",
      pattern: "run-ai-tests / run-playwright-tag",
    },
  ],
};
const saved = readJSON("gh_digest_user_config", {});
const logins = (value, fallback) =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string") : fallback;

export const config = {
  ORG: typeof saved.org === "string" && saved.org ? saved.org : "ardoq",
  TEAMS: logins(saved.teams, ["team-ai", "team-aiops"]),
  IGNORED_REPOS: new Set(["ardoq/ardoq-data-dbt"]),
  EXTRA_TEAMMATES: logins(saved.extraTeammates, defaults.extraTeammates),
  EXCLUDED_TEAMMATES: logins(
    saved.excludedTeammates,
    defaults.excludedTeammates,
  ),
  AGENT_BOT_LOGIN:
    typeof saved.agentBotLogin === "string"
      ? saved.agentBotLogin
      : defaults.agentBotLogin,
  DEFAULT_IGNORED_CI: Array.isArray(saved.defaultIgnoredCi)
    ? saved.defaultIgnoredCi.filter(
        (rule) =>
          rule &&
          typeof rule.repo === "string" &&
          typeof rule.pattern === "string",
      )
    : defaults.defaultIgnoredCi,
};

export const session = { USERNAME: "", teammates: new Set() };
