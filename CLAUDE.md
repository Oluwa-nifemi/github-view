# github-view

Single-file personal GitHub PR dashboard. `github-digest.html` is the whole app — open it in a browser, paste a PAT, done. No build, no deps, no server.

## When working here

- **Read `github-digest.map.md` first** — it indexes the entire HTML file by section, line range, function, and data shape. Use it to locate what you need without loading the whole file.
- **Never read the whole file.** It burns context. Use `rg` to find what you need, `sed -n` to read targeted line ranges, and `apply_patch` for surgical edits. The workflow is: (1) consult the map or `rg` to find the relevant lines, (2) `sed -n 'START,ENDp' github-digest.html` to read just that section, (3) `apply_patch` to edit. `cat github-digest.html` is banned — there is no reason to load ~3700 lines into memory.
- **Update the map after every structural change.** If you add, remove, rename, or move a CSS block, DOM section, or JS function, update `github-digest.map.md` to reflect the new line ranges and structure. The map is only useful if it stays current. Treat an outdated map as a bug.
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

### Notifications

- The top-level tabs are PRs and Notifications. The active tab persists in `localStorage`.
- Notifications are PR activity: reviews, comments, replies, @mentions, assignments, PR close/merge events, and `team-ai` mentions. Review requests stay in the PRs tab.
- Show bot comments only on your PRs, with a Bot label. Exclude bot comments on other authors' PRs.
- Use the clean `actor did thing` format. Do not add severity labels. Group same-actor, same-PR events within five minutes.
- The read lifecycle is Unread → Read (under 4h) → Old (4h–2d) → pruned. The Unread, Read, and Old filter persists in `localStorage`. Hover actions mark items read or unread.
- `emitNotificationEvents` builds events from snapshot diffs: reviews, plus comments on your PRs and PRs that requested your review. GitHub notification threads add mentions, assignments, state changes, and team mentions.
- `.gh-digest/watch.mjs` detects the same activity for macOS alerts. It uses `terminal-notifier`, filters alerts to human activity, and batches alerts for three minutes.

## After changes

- **Commit and push after every change.** Don't leave stale uncommitted edits sitting in the worktree.
- Verify in a browser. There's no test suite. Type-check is "does it parse".
- The user keeps the file open in a tab; a hard reload picks up edits.
- Old `gh_digest_last_snapshot` in localStorage may need clearing if you change snapshot shape in a non-backwards-compatible way (the fast-path guards usually handle this, but worth knowing).
