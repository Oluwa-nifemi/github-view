import { useState, useRef, useEffect } from "preact/hooks";
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
  const search = useRef(),
    container = useRef();
  const clear = () => {
    setAuthors([]);
    setRepos([]);
    setTeamOnly(false);
    setQuery("");
  };
  useEffect(() => {
    const onKey = (e) => {
      if (
        !container.current?.getClientRects().length ||
        container.current.hidden ||
        e.defaultPrevented
      )
        return;
      if (e.key === "Escape") {
        clear();
        search.current?.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      )
        return;
      search.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const list = Object.values(prs).filter(Boolean);
  const authorList = [
    ...new Set(list.map((pr) => pr.author).filter(Boolean)),
  ].sort();
  const repoList = [
    ...new Set(list.map((pr) => pr.repo).filter(Boolean)),
  ].sort();
  const keyClick = (callback) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      callback();
    }
  };
  return html`<div
    class="filters"
    ref=${container}
    id="filters"
    hidden=${!authorList.length && !repoList.length}
  >
    <label for="author-search">Author:</label
    ><input
      id="author-search"
      ref=${search}
      class="author-search"
      type="text"
      aria-label="Search authors"
      placeholder="type to filter…"
      autocomplete="off"
      value=${query}
      onInput=${(e) => setQuery(e.target.value)}
    />
    <div id="author-chips" class="author-chips">
      ${authorList.map((author) => html`<span role="button" tabIndex="0" aria-pressed=${authors.includes(author)} class=${`author-chip ${authors.includes(author) ? "active" : ""} ${authors.includes(author) || author.toLowerCase().includes(query.trim().toLowerCase()) ? "" : "search-hidden"}`} data-author=${author} onClick=${() => setAuthors(toggle(authors, author))} onKeyDown=${keyClick(() => setAuthors(toggle(authors, author)))}>${author}</span>`)}
    </div>
    <button
      id="teammates-filter"
      class=${teamOnly ? "active" : ""}
      aria-pressed=${teamOnly}
      onClick=${() => setTeamOnly(!teamOnly)}
    >
      Teammates only
    </button>
    <label>Repo:</label>
    <div id="repo-chips" class="author-chips">
      ${repoList.map((repo) => html`<span role="button" tabIndex="0" aria-pressed=${repos.includes(repo)} class=${`author-chip ${repos.includes(repo) ? "active" : ""}`} data-repo=${repo} onClick=${() => setRepos(toggle(repos, repo))} onKeyDown=${keyClick(() => setRepos(toggle(repos, repo)))}>${repo.split("/").pop()}</span>`)}
    </div>
    <button id="clear-filter" onClick=${clear}>Clear</button>
  </div>`;
}
