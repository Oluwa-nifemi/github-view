import { useState } from "preact/hooks";
import { html } from "./common.js";
import { toggle } from "./state.js";
export function Filters({
  prs,
  authors,
  repos,
  teamOnly,
  setAuthors,
  setRepos,
  setTeamOnly,
}) {
  const [query, setQuery] = useState("");
  const list = Object.values(prs).filter(Boolean);
  return html`<div class="filters">
    <label
      ><input
        type="checkbox"
        checked=${teamOnly}
        onChange=${(e) => setTeamOnly(e.target.checked)}
      />
      Teammates</label
    ><input
      class="author-search"
      aria-label="Search authors"
      placeholder="Find author"
      value=${query}
      onInput=${(e) => setQuery(e.target.value)}
    />
    <div class="author-chips">
      ${[...new Set(list.map((pr) => pr.author).filter(Boolean))]
        .sort()
        .filter((author) => author.toLowerCase().includes(query.toLowerCase()))
        .map(
          (author) =>
            html`<button
              class=${`author-chip ${authors.includes(author) ? "active" : ""}`}
              onClick=${() => setAuthors(toggle(authors, author))}
            >
              ${author}
            </button>`,
        )}
    </div>
    <label
      >Repository
      <select
        value=""
        onChange=${(e) => {
          if (e.target.value) setRepos(toggle(repos, e.target.value));
          e.target.value = "";
        }}
      >
        <option value="">Select repositories</option>
        ${[...new Set(list.map((pr) => pr.repo))].sort().map((repo) => html`<option value=${repo}>${repos.includes(repo) ? "✓ " : ""}${repo}</option>`)}
      </select></label
    >${repos.map((repo) => html`<button onClick=${() => setRepos(toggle(repos, repo))}>${repo} ×</button>`)}${
      authors.length || repos.length || teamOnly
        ? html`<button
            onClick=${() => {
              setAuthors([]);
              setRepos([]);
              setTeamOnly(false);
              setQuery("");
            }}
          >
            Clear filters
          </button>`
        : null
    }
  </div>`;
}
