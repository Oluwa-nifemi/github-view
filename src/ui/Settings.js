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
export function Settings({ onClose, onDisconnect, onSave }) {
  const [saving, setSaving] = useState(false);
  const ref = useRef();
  const [extra, setExtra] = useState(config.EXTRA_TEAMMATES.join(", "));
  const [excluded, setExcluded] = useState(
    config.EXCLUDED_TEAMMATES.join(", "),
  );
  const [bot, setBot] = useState(config.AGENT_BOT_LOGIN);
  const [org, setOrg] = useState(config.ORG);
  const [teams, setTeams] = useState(config.TEAMS.join(", "));
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
  const split = (value) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  async function save(e) {
    e.preventDefault();
    if (
      !/^[a-z0-9-]+$/i.test(org) ||
      split([extra, excluded, bot].join(",")).some(
        (s) => !/^[-a-z0-9]+(?:\[bot\])?$/i.test(s),
      )
    ) {
      setError("Enter a valid organization and GitHub logins.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(() => {
        Object.assign(config, {
          ORG: org,
          TEAMS: split(teams),
          EXTRA_TEAMMATES: split(extra),
          EXCLUDED_TEAMMATES: split(excluded),
          AGENT_BOT_LOGIN: bot.trim(),
          DEFAULT_IGNORED_CI: rules,
        });
        write("gh_digest_user_config", {
          org,
          teams: split(teams),
          extraTeammates: split(extra),
          excludedTeammates: split(excluded),
          agentBotLogin: bot.trim(),
          defaultIgnoredCi: rules,
        });
        write("gh_digest_ignored_ci", rules);
        localStorage.removeItem("gh_digest_team_members");
      });
      onClose();
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
  return html`<dialog ref=${ref} class="settings-modal" onCancel=${onClose}>
    <form onSubmit=${save}>
      <div class="settings-heading">
        <h2>Settings</h2>
        <button type="button" aria-label="Close settings" onClick=${onClose}>
          ×
        </button>
      </div>
      <label
        >Organization<input
          value=${org}
          required
          onInput=${(e) => setOrg(e.target.value)} /></label
      ><label
        >Teams (comma separated)<input
          value=${teams}
          onInput=${(e) => setTeams(e.target.value)} /></label
      ><label
        >Extra teammates<input
          value=${extra}
          onInput=${(e) => setExtra(e.target.value)} /></label
      ><label
        >Excluded teammates<input
          value=${excluded}
          onInput=${(e) => setExcluded(e.target.value)} /></label
      ><label
        >Agent bot login<input
          value=${bot}
          onInput=${(e) => setBot(e.target.value)}
      /></label>
      <h3>Ignored CI checks</h3>
      ${rules.map((rule, index) => html`<div class="ignore-rule"><code>${rule.repo}</code><code>${rule.pattern}</code><button type="button" onClick=${() => setRules(rules.filter((_, i) => i !== index))}>Remove</button></div>`)}
      <div class="settings-row">
        <input
          aria-label="CI repository"
          placeholder="owner/repo or *"
          value=${repo}
          onInput=${(e) => setRepo(e.target.value)}
        /><input
          aria-label="CI check pattern"
          placeholder="Check name contains"
          value=${pattern}
          onInput=${(e) => setPattern(e.target.value)}
        /><button
          type="button"
          disabled=${!pattern.trim()}
          onClick=${() => {
            setRules([
              ...rules,
              { repo: repo.trim() || "*", pattern: pattern.trim() },
            ]);
            setPattern("");
          }}
        >
          Add
        </button>
      </div>
      <h3>Move browser settings</h3>
      <label class="checkbox-label"
        ><input
          type="checkbox"
          checked=${includeContent}
          onChange=${(e) => setIncludeContent(e.target.checked)}
        />
        Include cached pull requests and notification history</label
      >
      <div class="settings-row">
        <button type="button" onClick=${exportState}>Export settings</button
        ><label class="import-label"
          >Import settings<input
            type="file"
            accept="application/json,.json"
            onChange=${importState}
        /></label>
      </div>
      <p class="muted">
        Exports include notes and preferences. Tokens are always excluded.
      </p>
      ${error && html`<p role="alert">${error}</p>`}
      <div class="settings-row">
        <button type="submit" class="primary" disabled=${saving}>
          ${saving ? "Saving…" : "Save settings"}</button
        ><button type="button" onClick=${onDisconnect}>
          Disconnect GitHub
        </button>
      </div>
    </form>
  </dialog>`;
}
