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
  const ref = useRef();
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
      extra,
      excluded,
      bot: config.AGENT_BOT_LOGIN,
      rules,
      ...patch,
    };
    if (
      [...next.extra, ...next.excluded, next.bot].some(
        (s) => !/^[-a-z0-9]+(?:\[bot\])?$/i.test(s),
      )
    ) {
      setError("Enter valid GitHub logins.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(() => {
        Object.assign(config, {
          EXTRA_TEAMMATES: next.extra,
          EXCLUDED_TEAMMATES: next.excluded,
          AGENT_BOT_LOGIN: next.bot,
          DEFAULT_IGNORED_CI: next.rules,
        });
        write("gh_digest_user_config", {
          org: config.ORG,
          teams: config.TEAMS,
          extraTeammates: next.extra,
          excludedTeammates: next.excluded,
          agentBotLogin: next.bot,
          defaultIgnoredCi: next.rules,
        });
        write("gh_digest_ignored_ci", next.rules);
        setExtra(next.extra);
        setExcluded(next.excluded);
        setRules(next.rules);
        localStorage.removeItem("gh_digest_team_members");
      });
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
  const tags = (items, key) =>
    items.length
      ? items.map(
          (item, index) =>
            html`<span class="settings-tag"
              >${item}<button
                type="button"
                aria-label=${`Remove ${item}`}
                disabled=${saving}
                onClick=${() => save({ [key]: items.filter((_, i) => i !== index) })}
              >
                ×
              </button></span
            >`,
        )
      : html`<span style="color:var(--muted);font-size:12px">None</span>`;
  const add = async (key, value, clear) => {
    const login = value.trim();
    if (!login || (key === "extra" ? extra : excluded).includes(login)) return;
    await save({ [key]: [...(key === "extra" ? extra : excluded), login] });
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
    <div class="settings-header">
      <h2>Settings</h2>
      <button
        id="settings-close"
        class="icon-button"
        aria-label="Close settings"
        onClick=${onClose}
      >
        ×
      </button>
    </div>
    <div class="settings-body">
      <div class="settings-section">
        <h3>Extra teammates</h3>
        <p class="settings-copy">
          Logins treated as teammates beyond the GitHub team roster.
        </p>
        <div id="extra-teammates-tags" class="settings-tag-list">
          ${tags(extra, "extra")}
        </div>
        <form
          class="settings-add-row"
          onSubmit=${(e) => {
            e.preventDefault();
            add("extra", extraInput, setExtraInput);
          }}
        >
          <input
            id="extra-teammate-input"
            placeholder="GitHub login"
            aria-label="Add extra teammate"
            value=${extraInput}
            onInput=${(e) => setExtraInput(e.target.value)}
          /><button type="submit" id="extra-teammate-add" disabled=${saving}>
            Add
          </button>
        </form>
      </div>
      <div class="settings-section">
        <h3>Excluded teammates</h3>
        <p class="settings-copy">Team members to hide from the dashboard.</p>
        <div id="excluded-teammates-tags" class="settings-tag-list">
          ${tags(excluded, "excluded")}
        </div>
        <form
          class="settings-add-row"
          onSubmit=${(e) => {
            e.preventDefault();
            add("excluded", excludedInput, setExcludedInput);
          }}
        >
          <input
            id="excluded-teammate-input"
            placeholder="GitHub login"
            aria-label="Add excluded teammate"
            value=${excludedInput}
            onInput=${(e) => setExcludedInput(e.target.value)}
          /><button type="submit" id="excluded-teammate-add" disabled=${saving}>
            Add
          </button>
        </form>
      </div>
      <div class="settings-section">
        <h3>Agent bot</h3>
        <p class="settings-copy">
          AI bot whose PRs are treated as yours when you're assigned.
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
          Matching is case-insensitive. Checks whether the job name contains the
          text.
        </p>
        <div id="ignore-rules" class="ignore-rules">
          ${rules.length ? rules.map((rule, index) => html`<div class="ignore-rule"><code>${rule.repo || "*"}</code><code>${rule.pattern}</code><button type="button" disabled=${saving} onClick=${() => save({ rules: rules.filter((_, i) => i !== index) })}>Stop ignoring</button></div>`) : html`<div class="ignore-empty">No CI checks are ignored.</div>`}
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
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <details class="settings-section settings-transfer">
        <summary>Move browser settings</summary>
        <p class="settings-copy">
          Exports include notes and preferences. Tokens are always excluded.
        </p>
        <label
          ><input
            type="checkbox"
            checked=${includeContent}
            onChange=${(e) => setIncludeContent(e.target.checked)}
          />
          Include cached pull requests and notification history</label
        >
        <div class="settings-add-row">
          <button type="button" onClick=${exportState}>Export settings</button
          ><label
            >Import settings<input
              type="file"
              accept="application/json,.json"
              onChange=${importState}
          /></label>
        </div>
      </details>
    </div>
  </dialog>`;
}
