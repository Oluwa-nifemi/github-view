# github-digest.html — file map

Single-file dashboard. Three top-level blocks: `<style>`, body markup, `<script>` IIFE.

## Layout / line ranges

Line numbers drift as edits land — treat as hints, grep to confirm.

### `<style>` (~7–319)
- CSS vars + dark-mode override (~8–38)
- Buttons, summary, setup card (~61–114)
- Filter bar + author/repo chips (~116–145)
- Section shell (`section.section`, collapsible, count badge) (~147–179)
- Card states: `.is-new` / `.is-escalated` / `.is-updated` / `.is-new-review` / `.stale` / `.archived` / `.is-draft` (~192–212)
- Card corner actions (archive/unarchive/delete buttons) (~214–243)
- Card meta + chips (`.chip.approved/changes/ci-fail/team-handled/draft/pending`) (~244–270)
- Change badges (`NEW/ESCALATED/UPDATED/NEW-REVIEW`) (~272–283)

### Body (~321–432)
- `#setup` — token onboarding panel (~322–339)
- `#app` — main UI, hidden until token loaded (~341–430)
  - Header + controls (refresh, sign out, spinner) (~342–350)
  - `#summary` + `#error-bar` (~352–353)
  - `.filters` — author chips, teammates toggle, repo chips, clear (~355–362)
  - Sections (each `<section class="section" id="section-X">`), in page order:
    - `section-3` ⭐ High Priority — collapsible (expanded by default); three tiers: pinned PRs at top (from any section via 📌), then author-grouped `<details>` (collapsed when ≥4 PRs, sorted by pending direct-request then recency), then a drafts `<details>`. Personal review-requests render here too, labeled `👤 requested you` / `👁 reviewed before` via `isDirect`.
    - `section-4` 🟢 Your Open PRs (collapsible, collapsed by default, has 4 status subgroups + a `<details class="my-archive-group">` "Set aside" subgroup for PRs stashed via `gh_digest_archived_mine`)
    - `section-3b` ⚪ Team Requests — Others
    - `section-team-handled` 🔵 Team Handled
    - `section-engaged` 💭 Engaged
    - `section-teammates-open` 👥 Teammates' Open PRs
    - `section-archive` 📦 Archived
    - `section-deleted` 🗑️ Deleted

### `<script>` IIFE (~435–end)
Top-level constants then functional blocks in order:

| Block | Purpose |
|---|---|
| Config consts (`ORG`, `TEAM`, `EXTRA_TEAMMATES`, `STORAGE_*`, `STALE_DAYS`, `TEAMMATES_TTL_MS`, `AUTO_REFRESH_MS`) plus mutable `USERNAME` | `USERNAME` is not hardcoded — it's a `let` hydrated from `gh_username`, derived from the token's `/user` login by `ensureUsername`; all `localStorage` keys live here; `AUTO_REFRESH_MS` = 3 min, controls both `setInterval` and visibility-change guard; `EXTRA_TEAMMATES` = logins treated as teammates beyond the GitHub team roster |
| DOM `$` helpers | element refs |
| State vars | `teammates`, filters, `archivedPRs`, `archivedMinePRs`, `rateLimitedUntilMs`, `etagCache` (in-memory Map: url → `{etag, data}`) |
| `archivedPRs` helpers — `isArchived`, `isDeleted`, `archivePR`, `deletePR`, `unarchivePR`, `persistArchived` | Global archive (any section). Entries: `{archivedAt, signature, deleted?, deletedAt?}`. Auto-resurface when `pr.updatedAt !== entry.signature`, unless `deleted: true`. |
| `archivedMinePRs` helpers — `isArchivedMine`, `archiveMinePR`, `unarchiveMinePR`, `persistArchivedMine` | Separate "set aside" mechanism scoped to section 4 (Your Open PRs) only. Entries: `{archivedAt}` — no auto-resurface on activity; stays parked until manually restored via the 🗄/↺ card button. Renders in the `<details class="my-archive-group">` subgroup instead of removing the PR from view. |
| `isStale` | >30 days since update |
| Token setup — `showSetup` / `hideSetup`, `ensureUsername`, `#token-save`, `#logout-btn` handlers | Validates token against `/user` and takes `USERNAME` from the returned login. `ensureUsername` back-fills it on refresh for sessions that stored a token before this key existed; a token for a different login clears the cached snapshot |
| GitHub fetch — `ghFetch`, `ghJson`, `search`, `ghGraphQL`, `searchByTeammates`, `repoFromIssue` | `ghJson` sends `If-None-Match` from `etagCache`, handles 304 (free request), caches new ETags on 200. Throws `RateLimitError` on 403/429 with `X-RateLimit-Remaining: 0`. `ghGraphQL` posts to the GraphQL endpoint. `searchByTeammates(qualifier, logins, token, extraQ?)` issues a single GraphQL search ORing multiple `author:` or `review-requested:` qualifiers — replaces N parallel REST searches. |
| `getTeammates(token)` | 24h-cached `/orgs/{ORG}/teams/{TEAM}/members`, unioned with `EXTRA_TEAMMATES` on every path (cache hit, fresh fetch, fetch failure) |
| `parsePRFromNotification`, `fetchRelevantNotifications` | Used to find PRs the team already handled (catches PRs no longer in your review-requested list) |
| **PR enrichment helpers** | `normalizeReviews(rawReviews)` → `{user,state,submittedAt}[]`. `latestNonCommentReviewsByReviewer(reviews, authorLogin, pendingLogins)` → Map used by `classifyMyPR` + `reviewChips`. `applyCachedPR(cached, title)` → fast-path spread for all sections. `buildPRBase(prId, repo, section, item, prDetail)` → common PR object fields (pass null for item in s5, null for prDetail in s7). |
| **`buildSnapshot(token, cachedSnapshot)`** — the big one | Runs the 4 searches in parallel, then enriches per section. Each section has a cache fast-path keyed on `updated_at`. Section-specific fields are spread on top of `buildPRBase`. |
| └─ Section 3 enrichment | review-requested PRs (direct + team) → fetches reviews + requested_reviewers + prDetail + `comments` (merged issue comments + PR review comments, `{user, createdAt}[]`). All land in section 3; `isDirect` flags a personal review-request (rendered as a `👤 requested you` / `👁 reviewed before` label instead of a separate section — sets `reviewedBefore` if you've already submitted a formal, non-comment-only review). Records `isDraft`. `diff` badges `UPDATED` on any new non-you comment, independent of `reviewedBefore`. (`case 1`/`case 2` in render still map into section 3's teamTeammates/teamOthers split, for old cached snapshots from before the "Needs Your Attention" section was folded in.) |
| └─ `checkCi(repo, sha)` | Dedupe check-runs by `(app.id, name)`, take latest; fail if any failure/timed_out/action_required, or any failing status. |
| └─ Section 4 enrichment | your authored + assigned PRs. Captures `headSha`, `ciFailing`, `isDraft`, **`pendingReviewers`** (count of `requested_reviewers` + `requested_teams` still outstanding — used by `classifyMyPR` to gate "approved"), and `comments` (merged issue comments + PR review comments, `{user, createdAt}[]`, used by `diff` to badge new non-author comments as `UPDATED`). CI re-checked every refresh even when cached. |
| └─ Section 5 (Team Handled) | PRs from notifications not covered above; tracks `youReviewed` and `teammateReviewers`. **If you already reviewed and `prDetail.updated_at` is newer than your last review, the PR is routed back to Team Requests (section 3) instead** — "changed since you touched it", no explicit re-review needed. |
| └─ Section 6 (Engaged) | `commenter:` search, last 30 days. |
| └─ Section 7 (Teammates' Open) | single GraphQL search across all teammate logins (`author:` ORed), last 14 days, no per-PR enrichment. |
| `diff(oldSnap, newSnap)` | Returns badges map: `NEW` (incl. any section change), `UPDATED` (`isDirect` + `reviewedBefore` + `updatedAt` changed, or new non-you comment in section 3), `NEW-REVIEW` (section 4, new non-author review). |
| **`classifyMyPR(pr)`** | Section 4 subgroup (active PRs only, excludes stashed): `ci_failing` > `changes_requested` > `approved` (only if `!pr.pendingReviewers`) > `awaiting`. |
| `relativeTime`, `reviewChips`, `renderCard`, `escapeHtml` | Rendering primitives. `reviewChips` emits personal-request/reviewed/draft/approved/changes/pending/ci-fail in that order. `renderCard(pr, badge, archived, promoted, archivedMine)` chooses card class from badge or `is-draft`/`archived-mine`, and renders archive/delete/unarchive/stash corner buttons based on `isArchived`/`isDeleted`/`archivedMine`. Pin button (📌) has no section restriction — pinning always floats a PR into High Priority (section-3), regardless of author/origin. |
| `applyFilter(prs)` | Author + teammate filters OR-combined; repo filter AND-combined. |
| `renderList`, `render(snapshot, badges)` | Buckets PRs per section. Order: `isDeleted` → deleted, `isArchived` → global archived, `isPromoted` → High Priority (section-3) unconditionally, then by `pr.section` (unpromoted teammate-authored team requests also land in section-3; non-teammate ones go to section-3b). Section 3 split into pinned → author-grouped `<details>` (collapsed ≥4 PRs) → drafts. Section 4 split into `isArchivedMine` (→ `.my-archive-group`) vs active, active grouped by `classifyMyPR`. |
| `renderFilters` | Builds author/repo chips from PR set, wires click handlers. |
| Collapsible `<h2>` click handler | toggles `.collapsed` and `▸ expand` / `▾ collapse` label (section-4's `<details>` subgroup uses native toggle instead). |
| Card-action click delegation | catches `data-action="archive\|delete\|unarchive\|promote\|demote\|stash-mine\|unstash-mine"` on any rendered card. |
| `refresh()` flow + `boot()` | Cached paint from `STORAGE_SNAPSHOT`, then live refresh. Stores snapshot back to localStorage every refresh. |

## Data shapes

### PR object (in `snapshot.prs[id]`)
```
id            "owner/repo#123"
number, repo, title, url
author, authorAvatar, authorIsTeammate
createdAt, updatedAt
section       1|2|3|4|5|6|7   (1/2 are legacy cached values, remapped into 3's split at render time)
isDraft       bool
reviews       [{user, state, submittedAt}]
// section 3 (review-requested, direct + team)
isDirect, isTeam, lastUserReviewAt, comments
// section 4 (your open PRs)
headSha, ciFailing, pendingReviewers, comments
// section 5
youReviewed, teammateReviewers
```

### `archivedPRs[id]` (global archive, any section)
```
{ archivedAt, signature?: updatedAt-at-archive-time, deleted?: bool, deletedAt? }
```

### `archivedMinePRs[id]` (section 4 "set aside", separate mechanism)
```
{ archivedAt }
```

## localStorage keys (all prefixed)
- `gh_token` — PAT
- `gh_username` — login derived from the PAT; cached to avoid a `/user` call per load
- `gh_digest_last_snapshot` — full snapshot for diffing + cache fast-paths
- `gh_digest_filter_authors`, `gh_digest_filter_repos`, `gh_digest_teammates` — filter state
- `gh_digest_archived` — global archive/delete map
- `gh_digest_archived_mine` — section-4-only "set aside" map, independent of the global archive
- `gh_digest_promoted` — set of PR ids manually pinned into High Priority (section-3)
- `gh_digest_team_members` — `{members, fetchedAt}`, 24h TTL

## Editing tips
- **Adding a new badge/state**: card class in style block + branch in `renderCard` class list + chip in `reviewChips`.
- **Adding a section**: DOM `<section>` + bucket key in `render()` + `renderList()` call. If it needs enrichment, add a block to `buildSnapshot` with a `cached.section === N` fast-path.
- **Cache invalidation**: any new field on a section's PR object needs the fast-path guard to check for its presence (see how `pendingReviewers !== undefined` is checked in section 4) or stale caches will skip re-enrichment.
- **CI logic** lives in `checkCi` only — touch nothing else for failures behavior.
