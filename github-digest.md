# GitHub PR Digest — Build Spec

---

## Why This Exists (Read This First)

The person building this (Oluwa-nifemi) is a developer at Ardoq on the `team-ai` team. They were
drowning in GitHub email notifications and trying to figure out how to get peace from them without
missing things that actually matter.

The core problem: GitHub emails every single event in real time. When you're on an active team,
you get hundreds of emails — PRs you're a codeowner of but don't need to action, comments on threads
you're watching, CI updates, etc. Filtering them into a Gmail label helps with inbox noise, but then
you forget to check the label. Turning on Gmail label notifications just recreates the original problem.
GitDailies and similar tools are team-wide tools requiring org adoption, and they still don't do
the intelligent personal prioritisation needed here.

The insight: what's actually needed is not a notification system, it's a **triage dashboard** —
a calm place you check intentionally that tells you exactly what needs your attention, ranked by
how urgent it actually is. Notifications should be subtle and only for things that genuinely
can't wait (someone directly requested your review, someone reviewed your PR).

The three-tier priority model came from a real distinction in how review requests arrive:
1. Someone picked you specifically → high priority, they're waiting on you
2. You already reviewed it but new commits arrived → medium, needs a re-check
3. You're on the team/codeowner group that got pinged → low, someone else on the team can probably handle it

The author filter exists because even within direct requests, there's a pecking order —
you want to prioritise teammates' PRs over others, and be able to quickly filter to just
"what do my immediate teammates need from me right now."

---

## Overview
A local single-file HTML app (`github-digest.html`) that you open in your browser.
It calls the GitHub API directly (no server needed), shows your PRs in priority order,
and fires subtle browser notifications on a schedule during working hours.

## GitHub Context
- **Your username:** `Oluwa-nifemi`
- **Org:** `ardoq`
- **Your team:** `ardoq/team-ai`

---

## Auth
- On first load, prompt for a GitHub Personal Access Token
- Store it in `localStorage` under key `gh_token`
- Required scopes: `repo`, `read:org`, `notifications`
- Show a link to create one: `https://github.com/settings/tokens/new`

---

## Data Fetching
Fetch on load and on a manual "Refresh" button. Do not auto-poll — user controls when they look.

### APIs to call:
1. **PRs requesting your review** (direct + team):
   `GET /search/issues?q=is:pr+is:open+review-requested:Oluwa-nifemi+org:ardoq`

2. **Your open PRs:**
   `GET /search/issues?q=is:pr+is:open+author:Oluwa-nifemi+org:ardoq`

3. **For each PR in category 1**, fetch the reviews to detect re-review needed:
   `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
   — If your last review timestamp < last commit pushed timestamp → re-review needed

4. **To distinguish direct vs team/codeowner requests:**
   `GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`
   — If `Oluwa-nifemi` appears in `users[]` → direct request
   — If only appears via `teams[]` (e.g. `team-ai`) → team/codeowner request

5. **For your open PRs**, fetch review status:
   `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
   `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` (CI status)

---

## UI — Four Sections

### 🔴 Section 1: Needs Your Attention (Direct)
PRs where you were explicitly added as a reviewer by name and haven't reviewed yet.
Sort by: oldest first (been waiting longest).

### 🟠 Section 2: Re-review Needed
PRs you already reviewed, but new commits have been pushed since your last review.
Sort by: most recently updated.

### 🟡 Section 3: Team / Codeowner Requests
PRs where you were requested via team membership or codeowner rules only — not personally tagged.
Collapsed by default. Badge shows count.
Sort by: oldest first.

### 🟢 Section 4: Your Open PRs
PRs you authored. Group by status:
- ✅ Approved — ready to merge
- 💬 Changes requested
- ⏳ Awaiting review (no reviews yet)
- ❌ CI failing
Sort within each group by: most recently updated.

---

## Filtering
- **Filter by PR author** — multiselect dropdown populated from the actual authors in the current results
- Selecting one or more authors shows only their PRs across all sections
- A "Your teammates" quick-filter preset that filters to `ardoq/team-ai` members (fetch team members via `GET /orgs/ardoq/teams/team-ai/members`)
- Filter state persists in `localStorage`

---

## Since Last Refresh — Change Highlighting

After every refresh, diff the new data against the previous snapshot and visually highlight what changed.

### What to store:
After each successful fetch, save a snapshot to `localStorage` under `gh_digest_last_snapshot`:
```json
{
  "timestamp": "<ISO timestamp>",
  "prs": {
    "<pr_number>": {
      "section": 1,
      "title": "...",
      "reviewers": [...],
      "lastCommitAt": "...",
      "yourLastReviewAt": "...",
      "reviews": [...],
      "ciStatus": "..."
    }
  }
}
```

### What to highlight on refresh:
| Change | Visual treatment |
|---|---|
| PR is new to any section | Green `NEW` badge on card, card has a subtle left border highlight |
| PR moved from Section 3 → Section 1 (escalated to direct request) | `ESCALATED` badge |
| PR moved to Section 2 (new commits after your review) | `UPDATED` badge |
| Review left on one of your PRs since last refresh | `NEW REVIEW` badge on that card |
| PR disappeared (merged/closed/review no longer needed) | Don't show it — just gone |

### Behaviour:
- Highlights are shown until the next refresh (not persistent across sessions)
- A summary line at the top of the page after refresh: e.g. "3 changes since your last refresh 12 minutes ago"
- If nothing changed: "No changes since last refresh 12 minutes ago"
- The previous snapshot timestamp ("last refreshed X minutes ago") is always visible near the Refresh button

---

## Notifications
Use the **Web Notifications API** (`Notification.requestPermission()`).

### Schedule
- Only fire during working hours: **Mon–Fri, 08:00–18:00** (detect from browser timezone)
- Check every **30 minutes** using `setInterval` — this triggers a silent background re-fetch and diff
- On each check, compare current data to the last snapshot in `localStorage`

### What triggers a notification:
| Event | Message |
|---|---|
| New PR in Section 1 (direct review request) | "🔴 [author] needs your review on: [PR title]" |
| New PR moves to Section 2 (re-review needed) | "🟠 New commits on a PR you reviewed: [PR title]" |
| Review left on one of your PRs | "💬 [reviewer] reviewed your PR: [PR title]" |

### What does NOT trigger a notification:
- New team/codeowner requests (Section 3) — too noisy
- CI status changes
- Comments (not reviews)

### Notification behaviour:
- One notification per new event, not batched
- Clicking the notification opens the PR URL directly
- No sound
- After firing, update the snapshot so the same event doesn't notify twice

---

## Design
- Clean, minimal — dark or light mode following system preference
- Each PR card shows: title, repo name, author avatar + name, age (e.g. "3 days ago"), review status chips
- Clicking a PR card opens it in a new tab
- Last refreshed timestamp shown at top right next to Refresh button (e.g. "Last refreshed 4 minutes ago")
- "Refresh" button top right
- Section headers show count badge e.g. "🔴 Needs Your Attention (3)"
- Change highlight badges (`NEW`, `ESCALATED`, `UPDATED`, `NEW REVIEW`) are small, coloured, pill-shaped, in the top-right corner of each card

---

## File Structure
Single file: `github-digest.html`
- Inline CSS (no external stylesheets)
- Inline JS (no bundler, no npm)
- No external dependencies except the GitHub REST API

---

## localStorage Keys
| Key | Contents |
|---|---|
| `gh_token` | GitHub PAT |
| `gh_digest_last_snapshot` | Full PR snapshot from last fetch (for diffing) |
| `gh_digest_filter_authors` | Currently selected author filters |
| `gh_digest_notified_ids` | Set of PR+event combos already notified, to avoid duplicates |

---

## Setup Instructions (to include in the app's first-run screen)
1. Go to https://github.com/settings/tokens/new
2. Give it a name like "PR Digest"
3. Select scopes: `repo`, `read:org`, `notifications`
4. Generate and copy the token
5. Paste it into this app — it's stored only in your browser's localStorage

---

## Out of Scope (don't build)
- Issues
- Comments (non-review)
- Repos outside the `ardoq` org
- Any backend/server component
- Anything requiring npm or a build step
