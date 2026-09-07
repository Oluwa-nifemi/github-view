# Module Map

| Area                   | Files                                                                                 | Responsibility                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Entry                  | `index.html`, `src/main.js`                                                           | Mount Preact and import styles                                        |
| Lifecycle              | `src/ui/useDashboard.js`, `App.js`, `Auth.js`                                         | Connect/disconnect, cached paint, refresh coordination, account state |
| PR interface           | `src/ui/PRList.js`, `PRCard.js`, `Filters.js`                                         | Bucketing, filtering, notes, pin/archive/delete/set-aside             |
| Notifications          | `src/ui/Notifications.js`, `src/notifications/events.js`                              | Feed views and snapshot-derived events                                |
| Settings               | `src/ui/Settings.js`                                                                  | Team configuration, ignored CI, credential-free settings transfer     |
| Persistence            | `src/storage.js`, `src/ui/state.js`                                                   | JSON reads, schema validation, persisted hooks and retention          |
| Configuration          | `src/config.js`                                                                       | Organization/team defaults, mutable preferences, active session       |
| API transport          | `src/github/client.js`, `concurrent.js`                                               | HTTP, rate limits, pagination, ETags and draining concurrent work     |
| GitHub queries         | `src/github/search.js`, `teammates.js`, `notifications.js`                            | Search, GraphQL decisions, roster caching, notification sources       |
| Snapshot orchestration | `src/snapshot/build.js`                                                               | Gather sources, deduplicate, run stages, version/cache scope          |
| Snapshot stages        | `requested.js`, `agent.js`, `mine.js`, `handled.js`, `engaged.js`, `teammate-open.js` | Separate PR source rules; explicit build context                      |
| Snapshot helpers       | `src/snapshot/model.js`, `ci.js`                                                      | PR data shape and CI classification                                   |
| Domain rules           | `src/domain/reviews.js`, `activity.js`, `comments.js`, `text.js`                      | Review classification, badges, activity, normalized comments          |
| Styling                | `src/styles/base.css`, `cards.css`, `app.css`                                         | Theme/layout, repeated cards, responsive controls                     |
| Local runtime          | `scripts/serve.mjs`, `startup.mjs`                                                    | Loopback server and macOS login service                               |
| Migration              | `github-digest.html`, `scripts/export-legacy.js`                                      | Export settings from the old file origin                              |
| Watcher                | `.gh-digest/watch.mjs`                                                                | Optional separate one-shot macOS notification check                   |

## Data Contracts

Snapshot: `{version, scope, prs, mentions, timestamp}`. `prs` maps `owner/repo#number` to PR data. Section numbers remain compatible with old caches: 3=requested, 4=mine, 5=handled, 6=engaged, 7=teammates. Legacy 1/2 render as requested.

PR data includes identity/title/link, author/teammate membership, dates, reviews, comments, draft state, and section-specific CI/request/activity fields. Add normalized fields in the owning stage and increase snapshot version if existing cached entries would lack them.

Local storage retains the existing `gh_*` keys. Global archive/delete, my-PR set-aside, pins, notes, filters, collapse state, and notification read/pin state are separate concepts. An archived PR resurfaces when its activity signature changes; deleted items stay hidden until restored.

The pre-migration HTML and specification remain in Git history. `docs/audit.md` records the audit that motivated this split.
