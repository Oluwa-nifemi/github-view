import { useState } from "preact/hooks";
import { html } from "./common.js";
import { config } from "../config.js";

export function Auth({ connect, busy, error }) {
  const [token, setToken] = useState("");
  const [org, setOrg] = useState(config.ORG);
  const [teams, setTeams] = useState(config.TEAMS.join(", "));
  const [formError, setFormError] = useState("");
  const shownError = formError || error;
  return html`<div id="setup">
    <h2>GitHub Digest — Setup</h2>
    <p>
      This dashboard reads your GitHub PRs directly. To do that it needs a
      Personal Access Token.
    </p>
    <ol>
      <li>
        Go to${" "}
        <a
          href="https://github.com/settings/tokens/new"
          target="_blank"
          rel="noopener noreferrer"
          >github.com/settings/tokens/new</a
        >
      </li>
      <li>Name it something like <em>"PR Digest"</em></li>
      <li>
        Select scopes: <code>repo</code>,${" "}<code>read:org</code>,${" "}
        <code>notifications</code>
      </li>
      <li>
        If your organization uses SAML SSO, click <em>Configure SSO</em> to
        authorize the token
      </li>
      <li>Generate, copy, and paste below</li>
    </ol>
    <form
      onSubmit=${(event) => {
        event.preventDefault();
        if (!token.trim()) {
          setFormError("Enter a GitHub token.");
          return;
        }
        const nextOrg = org.trim();
        if (nextOrg && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(nextOrg)) {
          setFormError("Enter a valid GitHub organization name.");
          return;
        }
        const parsedTeams = teams
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const invalidTeam = parsedTeams.find(
          (t) => !/^[a-z0-9][a-z0-9-_]*$/i.test(t),
        );
        if (invalidTeam) {
          setFormError(
            `Use the team slug only: "${invalidTeam.split("/").pop()}", not "${invalidTeam}".`,
          );
          return;
        }
        setFormError("");
        connect(token.trim(), {
          org: nextOrg,
          teams: parsedTeams,
        });
      }}
    >
      <label class="setup-field"
        >Token (stored only in this browser's localStorage)
        <input
          id="token-input"
          aria-label="GitHub token"
          type="password"
          placeholder="ghp_..."
          autocomplete="off"
          spellcheck="false"
          value=${token}
          onInput=${(event) => setToken(event.target.value)}
        />
      </label>
      <div class="setup-optional">
        <div class="setup-optional-grid">
          <label class="setup-field"
            >Organization <span class="setup-hint">(optional)</span>
            <input
              id="setup-org-input"
              aria-label="GitHub organization"
              placeholder="e.g. my-org"
              autocomplete="off"
              spellcheck="false"
              value=${org}
              onInput=${(event) => setOrg(event.target.value)}
            />
          </label>
          <label class="setup-field"
            >Teams <span class="setup-hint">(optional, comma-separated)</span>
            <input
              id="setup-teams-input"
              aria-label="GitHub teams"
              placeholder="Team slugs, e.g. frontend, platform"
              autocomplete="off"
              spellcheck="false"
              value=${teams}
              onInput=${(event) => setTeams(event.target.value)}
            />
          </label>
        </div>
        <p class="setup-note">
          Leave blank to include pull requests from all accessible repositories.
          You can change these anytime in Settings.
        </p>
      </div>
      <div class="actions">
        <button id="token-save" class="primary" disabled=${busy}>
          Save and load
        </button>
      </div>
    </form>
    <div id="token-error" class="error" role="alert" hidden=${!shownError}>
      ${shownError}
    </div>
  </div>`;
}
