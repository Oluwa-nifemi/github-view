import { useState } from "preact/hooks";
import { html } from "./common.js";

export function Auth({ connect, busy, error }) {
  const [token, setToken] = useState("");
  return html`<div id="setup">
    <h2>GitHub Digest — Setup</h2>
    <p>
      This dashboard reads your GitHub PRs directly. To do that it needs a
      Personal Access Token.
    </p>
    <ol>
      <li>
        Go to
        <a
          href="https://github.com/settings/tokens/new"
          target="_blank"
          rel="noopener noreferrer"
          >github.com/settings/tokens/new</a
        >
      </li>
      <li>Name it something like <em>"PR Digest"</em></li>
      <li>
        Select scopes: <code>repo</code>, <code>read:org</code>,
        <code>notifications</code>
      </li>
      <li>Generate, copy, and paste below</li>
    </ol>
    <form
      onSubmit=${(event) => {
      event.preventDefault();
      if (token.trim()) connect(token.trim());
    }}
    >
      <label
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
      <div class="actions">
        <button id="token-save" class="primary" disabled=${busy}>
          Save and load
        </button>
      </div>
    </form>
    <div id="token-error" class="error" role="alert" hidden=${!error}>
      ${error}
    </div>
  </div>`;
}
