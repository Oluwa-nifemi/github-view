import { readJSON } from "./storage.js";

const defaults = {
  org: "",
  teams: [],
  ignoredRepos: [],
  extraTeammates: [],
  excludedTeammates: [],
  agentBotLogin: "",
  defaultIgnoredCi: [],
};
const saved = readJSON("gh_digest_user_config", {});
const stringList = (value, fallback) =>
  Array.isArray(value)
    ? value.filter((v) => typeof v === "string" && v.trim())
    : fallback;

export const config = {
  ORG: typeof saved.org === "string" ? saved.org.trim() : defaults.org,
  TEAMS: stringList(saved.teams, defaults.teams),
  IGNORED_REPOS: new Set(stringList(saved.ignoredRepos, defaults.ignoredRepos)),
  EXTRA_TEAMMATES: stringList(saved.extraTeammates, defaults.extraTeammates),
  EXCLUDED_TEAMMATES: stringList(
    saved.excludedTeammates,
    defaults.excludedTeammates,
  ),
  AGENT_BOT_LOGIN:
    typeof saved.agentBotLogin === "string"
      ? saved.agentBotLogin.trim()
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
