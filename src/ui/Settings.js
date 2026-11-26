import { useState, useRef, useEffect } from "preact/hooks";
import { html } from "./common.js";
import { config } from "../config.js";
import { read, write } from "./state.js";

const transferable = [
  "gh_digest_user_config",
  "gh_digest_ignored_ci",
  "gh_digest_filter_authors",
  "gh_digest_filter_repos",
  "gh_digest_archived",
  "gh_digest_archived_mine",
  "gh_digest_notes",
  "gh_digest_ticket_names",
  "gh_digest_promoted",
  "gh_digest_collapsed_authors",
  "gh_digest_collapsed_sections",
  "gh_digest_notification_prefs",
  "gh_digest_active_view",
  "gh_digest_notif_filter",
  "gh_digest_teammates",
  "gh_digest_last_snapshot",
  "gh_digest_notifications",
];
const rawKeys = [
  "gh_digest_active_view",
  "gh_digest_notif_filter",
  "gh_digest_teammates",
];
const contentKeys = ["gh_digest_last_snapshot", "gh_digest_notifications"];
export function Settings({ onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const ref = useRef();
  const [org, setOrg] = useState(config.ORG);
  const [teams, setTeams] = useState([...config.TEAMS]);
  const [teamInput, setTeamInput] = useState("");
  const [ignoredRepos, setIgnoredRepos] = useState([...config.IGNORED_REPOS]);
  const [ignoredRepoInput, setIgnoredRepoInput] = useState("");
  const [extra, setExtra] = useState([...config.EXTRA_TEAMMATES]);
  const [excluded, setExcluded] = useState([...config.EXCLUDED_TEAMMATES]);
  const [extraInput, setExtraInput] = useState("");
  const [excludedInput, setExcludedInput] = useState("");
  const [bot, setBot] = useState(config.AGENT_BOT_LOGIN);
  const [includeContent, setIncludeContent] = useState(false);
  const [rules, setRules] = useState(
    read("gh_digest_ignored_ci", config.DEFAULT_IGNORED_CI),
  );
  const [repo, setRepo] = useState("*"),
    [pattern, setPattern] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current.showModal();
  }, []);
  async function save(patch = {}) {
    const next = {
      org: config.ORG,
      teams,
      ignoredRepos,
      extra,
      excluded,
      bot: config.AGENT_BOT_LOGIN,
      rules,
      ...patch,
    };
    if (next.org && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(next.org)) {
      setError("Enter a valid GitHub organization name.");
      return;
    }
    if (next.teams.some((s) => !/^[a-z0-9][a-z0-9-_]*$/i.test(s))) {
      setError("Enter valid GitHub team slugs.");
      return;
    }
    if (
      next.ignoredRepos.some((s) => !/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(s))
    ) {
      setError("Enter ignored repositories in owner/repo format.");
      return;
    }
    if (
      [...next.extra, ...next.excluded].some(
        (s) => !/^[-a-z0-9]+(?:\[bot\])?$/i.test(s),
      ) ||
      (next.bot && !/^[-a-z0-9]+(?:\[bot\])?$/i.test(next.bot))
    ) {
      setError("Enter valid GitHub logins.");
      return;
    }
    setSaving(true);
    setSavedMessage("");
    setError("");
    try {
      await onSave(() => {
        Object.assign(config, {
          ORG: next.org,
          TEAMS: next.teams,
          IGNORED_REPOS: new Set(next.ignoredRepos),
          EXTRA_TEAMMATES: next.extra,
          EXCLUDED_TEAMMATES: next.excluded,
          AGENT_BOT_LOGIN: next.bot,
          DEFAULT_IGNORED_CI: next.rules,
        });
        write("gh_digest_user_config", {
          org: next.org,
          teams: next.teams,
          ignoredRepos: next.ignoredRepos,
          extraTeammates: next.extra,
          excludedTeammates: next.excluded,
          agentBotLogin: next.bot,
          defaultIgnoredCi: next.rules,
        });
        write("gh_digest_ignored_ci", next.rules);
        setOrg(next.org);
        setTeams(next.teams);
        setIgnoredRepos(next.ignoredRepos);
        setExtra(next.extra);
        setExcluded(next.excluded);
        setBot(next.bot);
        setRules(next.rules);
        localStorage.removeItem("gh_digest_team_members");
      });
      setSavedMessage("Saved and refreshed");
    } catch (error) {
      setError(error.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }
  function exportState() {
    const data = {
      version: 1,
      settings: Object.fromEntries(
        transferable
          .filter((key) => includeContent || !contentKeys.includes(key))
          .filter((key) => localStorage.getItem(key) !== null)
          .map((key) => [
            key,
            rawKeys.includes(key)
              ? localStorage.getItem(key)
              : JSON.parse(localStorage.getItem(key)),
          ]),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "github-digest-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importState(e) {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2_000_000) throw new Error("Settings file is too large.");
      const data = JSON.parse(await file.text());
      if (
        data.version !== 1 ||
        !data.settings ||
        typeof data.settings !== "object"
      )
        throw new Error("Choose a GitHub Digest settings export.");
      for (const [key, value] of Object.entries(data.settings)) {
        if (!transferable.includes(key)) continue;
        if (rawKeys.includes(key)) {
          if (typeof value !== "string")
            throw new Error(`Invalid setting: ${key}`);
          continue;
        }
        const arrays = [
          "gh_digest_ignored_ci",
          "gh_digest_filter_authors",
          "gh_digest_filter_repos",
          "gh_digest_promoted",
          "gh_digest_collapsed_authors",
          "gh_digest_notifications",
        ];
        if (
          arrays.includes(key)
            ? !Array.isArray(value)
            : !value || typeof value !== "object" || Array.isArray(value)
        )
          throw new Error(`Invalid setting: ${key}`);
      }
      for (const [key, value] of Object.entries(data.settings))
        if (transferable.includes(key)) {
          if (rawKeys.includes(key)) localStorage.setItem(key, value);
          else write(key, value);
        }
      location.reload();
    } catch (error) {
      setError(error.message);
    }
  }
  const tags = (items, key, emptyText = "None configured") =>
    items.length
      ? items.map(
          (item, index) =>
            html`<span class="settings-tag"
              ><span>${item}</span
              ><button
                type="button"
                aria-label=${`Remove ${item}`}
                disabled=${saving}
                onClick=${() => save({ [key]: items.filter((_, i) => i !== index) })}
              >
                ×
              </button></span
            >`,
        )
      : html`<span class="settings-empty">${emptyText}</span>`;
  const addItem = async (key, list, value, clear) => {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    await save({ [key]: [...list, trimmed] });
    clear("");
  };
  return html`<dialog
    id="settings-dialog"
    ref=${ref}
    onCancel=${onClose}
    onClick=${(e) => {
      if (e.target === ref.current) onClose();
    }}
  >
    <div class="settings-shell">
      <div class="settings-header">
        <div>
          <h2>Settings</h2>
          <p class="settings-subtitle">
            Configure your GitHub scope, teammates, CI filters, and browser
            backup.
          </p>
        </div>
        <div class="settings-header-actions">
          ${savedMessage && html`<span class="settings-status" role="status">${savedMessage}</span>`}
          <button
            id="settings-close"
            class="icon-button"
            aria-label="Close settings"
            onClick=${onClose}
          >
            ×
          </button>
        </div>
      </div>
      <div class="settings-body">
        ${error && html`<div class="settings-error" role="alert">${error}</div>`}

        <div class="settings-group">
          <div class="settings-group-label">Workspace</div>
          <div class="settings-card">
            <div class="settings-section">
              <h3>Organization</h3>
              <p class="settings-copy">
                Limit PRs and notifications to one GitHub organization, or leave
                blank for all accessible repositories.
              </p>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  save({ org: org.trim() });
                }}
              >
                <input
                  id="org-input"
                  placeholder="e.g. my-org (leave blank for all repos)"
                  aria-label="GitHub organization"
                  value=${org}
                  onInput=${(e) => setOrg(e.target.value)}
                /><button type="submit" id="org-save" disabled=${saving}>
                  Save
                </button>
              </form>
            </div>

            <div class="settings-section">
              <h3>Teams</h3>
              <p class="settings-copy">
                Team slugs within your organization used for team review
                requests and the teammate roster.
              </p>
              <div id="teams-tags" class="settings-tag-list">
                ${tags(teams, "teams", "No teams configured")}
              </div>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  addItem("teams", teams, teamInput, setTeamInput);
                }}
              >
                <input
                  id="team-input"
                  placeholder="Team slug, e.g. frontend"
                  aria-label="Add team"
                  value=${teamInput}
                  onInput=${(e) => setTeamInput(e.target.value)}
                /><button type="submit" id="team-add" disabled=${saving}>
                  Add
                </button>
              </form>
              ${!org.trim() && teams.length > 0 && html`<p class="settings-hint">Set an organization above so team rosters can be loaded.</p>`}
            </div>

            <div class="settings-section">
              <h3>Ignored repositories</h3>
              <p class="settings-copy">
                Repositories excluded from PR lists, searches, and
                notifications.
              </p>
              <div id="ignored-repos-tags" class="settings-tag-list">
                ${tags(ignoredRepos, "ignoredRepos", "No repositories ignored")}
              </div>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  addItem(
                    "ignoredRepos",
                    ignoredRepos,
                    ignoredRepoInput,
                    setIgnoredRepoInput,
                  );
                }}
              >
                <input
                  id="ignored-repo-input"
                  placeholder="owner/repo"
                  aria-label="Add ignored repository"
                  value=${ignoredRepoInput}
                  onInput=${(e) => setIgnoredRepoInput(e.target.value)}
                /><button
                  type="submit"
                  id="ignored-repo-add"
                  disabled=${saving}
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">Teammates</div>
          <div class="settings-card">
            <div class="settings-section">
              <h3>Extra teammates</h3>
              <p class="settings-copy">
                GitHub logins treated as teammates beyond your team roster.
              </p>
              <div id="extra-teammates-tags" class="settings-tag-list">
                ${tags(extra, "extra", "None")}
              </div>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  addItem("extra", extra, extraInput, setExtraInput);
                }}
              >
                <input
                  id="extra-teammate-input"
                  placeholder="GitHub login"
                  aria-label="Add extra teammate"
                  value=${extraInput}
                  onInput=${(e) => setExtraInput(e.target.value)}
                /><button
                  type="submit"
                  id="extra-teammate-add"
                  disabled=${saving}
                >
                  Add
                </button>
              </form>
            </div>

            <div class="settings-section">
              <h3>Excluded teammates</h3>
              <p class="settings-copy">
                Team members to exclude from the teammate roster.
              </p>
              <div id="excluded-teammates-tags" class="settings-tag-list">
                ${tags(excluded, "excluded", "None")}
              </div>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  addItem(
                    "excluded",
                    excluded,
                    excludedInput,
                    setExcludedInput,
                  );
                }}
              >
                <input
                  id="excluded-teammate-input"
                  placeholder="GitHub login"
                  aria-label="Add excluded teammate"
                  value=${excludedInput}
                  onInput=${(e) => setExcludedInput(e.target.value)}
                /><button
                  type="submit"
                  id="excluded-teammate-add"
                  disabled=${saving}
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">Automation & CI</div>
          <div class="settings-card">
            <div class="settings-section">
              <h3>Agent bot</h3>
              <p class="settings-copy">
                Optional bot login whose PRs appear under Your Open PRs when
                you're assigned. Leave blank to disable.
              </p>
              <form
                class="settings-add-row"
                onSubmit=${(e) => {
                  e.preventDefault();
                  save({ bot: bot.trim() });
                }}
              >
                <input
                  id="agent-bot-input"
                  placeholder="e.g. copilot-swe-agent (leave blank to disable)"
                  aria-label="Agent bot login"
                  value=${bot}
                  onInput=${(e) => setBot(e.target.value)}
                /><button type="submit" id="agent-bot-save" disabled=${saving}>
                  Save
                </button>
              </form>
            </div>

            <div class="settings-section">
              <h3>Ignored CI checks</h3>
              <p class="settings-copy">
                Case-insensitive substring match against check job names. Use
                <code>*</code> to match all repositories.
              </p>
              <div id="ignore-rules" class="ignore-rules">
                ${rules.length ? rules.map((rule, index) => html`<div class="ignore-rule"><code class="ignore-repo-badge">${rule.repo || "*"}</code><code class="ignore-pattern-code">${rule.pattern}</code><button type="button" class="ignore-remove" disabled=${saving} onClick=${() => save({ rules: rules.filter((_, i) => i !== index) })}>Stop ignoring</button></div>`) : html`<div class="ignore-empty">No CI checks are ignored.</div>`}
              </div>
              <form
                id="ignore-form"
                class="ignore-form"
                onSubmit=${(e) => {
                  e.preventDefault();
                  if (pattern.trim()) {
                    save({
                      rules: [
                        ...rules,
                        { repo: repo.trim() || "*", pattern: pattern.trim() },
                      ],
                    });
                    setPattern("");
                  }
                }}
              >
                <input
                  id="ignore-repo"
                  placeholder="Repository or *"
                  aria-label="Repository scope"
                  value=${repo}
                  onInput=${(e) => setRepo(e.target.value)}
                /><input
                  id="ignore-pattern"
                  placeholder="Job name contains…"
                  aria-label="Job name pattern"
                  required
                  value=${pattern}
                  onInput=${(e) => setPattern(e.target.value)}
                /><button type="submit" disabled=${saving}>Add rule</button>
              </form>
            </div>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-label">Data & Backup</div>
          <details class="settings-card settings-transfer">
            <summary>Move browser settings</summary>
            <div class="settings-transfer-body">
              <p class="settings-copy">
                Export or import your notes, filters, and preferences as JSON.
                GitHub tokens are never included.
              </p>
              <label class="settings-checkbox"
                ><input
                  type="checkbox"
                  checked=${includeContent}
                  onChange=${(e) => setIncludeContent(e.target.checked)}
                />
                <span
                  >Include cached pull requests and notification history</span
                ></label
              >
              <div class="settings-transfer-actions">
                <button type="button" class="primary" onClick=${exportState}>
                  Export settings
                </button>
                <label class="settings-file-btn"
                  >Import settings<input
                    type="file"
                    accept="application/json,.json"
                    onChange=${importState}
                /></label>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </dialog>`;
}
