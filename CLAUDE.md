# github-view

Single-file personal GitHub PR dashboard. `github-digest.html` is the whole app — open it in a browser, paste a PAT, done. No build, no deps, no server.

## When working here

- **Read `github-digest.map.md` first** — it indexes the HTML so you don't need to load the whole 1400-line file to find things. Grep into the HTML for exact lines when needed.
- Only edit `github-digest.html`. There is no source-vs-build split.
- The user is `Oluwa-nifemi` at org `ardoq`, team `team-ai` — these are hardcoded constants near the top of the IIFE.
- All state persists in `localStorage` under `gh_*` keys (see map).

## Conventions in this file

- Vanilla JS in one IIFE — no framework, no modules, no bundler. Keep it that way.
- All network goes through `ghFetch` / `ghJson` (REST) or `ghGraphQL` (GraphQL). Don't introduce additional fetch wrappers.
- Teammate-wide searches (multiple `author:` or `review-requested:` qualifiers) use `searchByTeammates(qualifier, logins, token, extraQ?)` — a single GraphQL request that ORs all logins. Don't revert to per-login REST searches; they exhaust the rate limit.
- Snapshot is the source of truth: `buildSnapshot` produces `{prs, timestamp}`, `render` consumes it. Avoid sneaking DOM mutations elsewhere.
- Section enrichment uses a cache fast-path keyed on `item.updated_at`. **If you add a field to a PR object, update the fast-path guard for that section** or stale caches will silently miss it (see `pendingReviewers !== undefined` in section 4 as the pattern).
- Light/dark mode is via CSS vars + `@media (prefers-color-scheme: dark)`. Don't hardcode colors.
- `escapeHtml` everything user/GitHub-provided that goes into innerHTML.

## After changes

- **Commit and push after every change.** Don't leave stale uncommitted edits sitting in the worktree.
- Verify in a browser. There's no test suite. Type-check is "does it parse".
- The user keeps the file open in a tab; a hard reload picks up edits.
- Old `gh_digest_last_snapshot` in localStorage may need clearing if you change snapshot shape in a non-backwards-compatible way (the fast-path guards usually handle this, but worth knowing).
