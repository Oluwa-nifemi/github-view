import { useState } from "preact/hooks";
import { html } from "./common.js";
export function Auth({ connect, busy, error }) {
  const [token, setToken] = useState("");
  return html`<section id="setup">
    <h2>Connect GitHub</h2>
    <p>A GitHub token is stored only in this browser.</p>
    <p>
      <a
        href="https://github.com/settings/tokens"
        target="_blank"
        rel="noopener noreferrer"
        >Create a token</a
      >
      with repository, organization read, and notification access. Authorize
      organization SSO when required.
    </p>
    <form
      onSubmit=${(e) => {
        e.preventDefault();
        connect(token.trim());
      }}
    >
      <label
        >GitHub token<input
          type="password"
          autocomplete="off"
          value=${token}
          onInput=${(e) => setToken(e.target.value)}
          required
      /></label>
      <div class="actions">
        <button class="primary" disabled=${busy || !token.trim()}>
          ${busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
    ${error && html`<p class="error" role="alert">${error}</p>`}
  </section>`;
}
