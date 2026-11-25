# Maintainability audit

The audit reviewed the original `github-digest.html` (over 3,600 lines) and
`.gh-digest/watch.mjs`. References below are original pre-migration line numbers.

## Findings

- **P1: Partial refresh loses cards.** Per-PR enrichment catches logged errors
  without retaining a card (HTML 1838, 1983, 2119, 2213), then refresh persisted
  the incomplete snapshot (2959). Retain cached data and disclose failures.
- **P1: CI errors look successful.** `checkCi` returned false on API failure
  (1913), allowing an approved classification without verified CI.
- **P2: Refresh races.** Refresh lacked an in-flight guard (2938), while timer
  and visibility handlers independently triggered requests (3608).
- **P2: Storage corruption blocks startup.** Top-level unguarded JSON parsing
  (1133, 1181-1189, 1286) could prevent boot. Validate persisted shapes and use
  recoverable defaults.
- **P2: Pagination truncates activity.** Search (1411, 1444), notifications
  (1548, 1560), and review/comment requests stopped after their first page.
- **P2: Watcher portability.** Watcher 11-13 assumed Homebrew binary locations
  and another user's plaintext token path. Use PATH and existing gh credentials.
- **P2: Incorrect reply attribution.** Watcher 155-156 called every threaded
  reply a reply to the signed-in user. Resolve the parent author.
- **P2: Notification deduplication never expires.** Watcher 98 used only thread
  ID, suppressing subsequent mentions on the same thread; history grew forever
  (205). Include activity timestamp and bound retained history.
- **Rendering risks.** HTML 2450 and 2486 directly interpolated URL attributes;
  cards nested buttons inside anchors. Validate URLs and separate controls.

## Structure

Snapshot construction combined search, enrichment, CI, routing, and fallback
logic in approximately 615 lines. Notifications added another independent
subsystem. Recommended boundaries are API/search, snapshot/enrichment, pure
review/activity rules, persistence, PR presentation, notifications, settings,
and application lifecycle. Preact with Vite provides a small, established
component model and straightforward local development.

The old map and agent instructions had drifted from actual behavior. Preserve
multiple teams, configurable teammate inclusions/exclusions, ignored CI rules,
notes, collapsed groups, agent assignments, and review-decision handling when
changing structure. Moving from a file URL to localhost creates a different
storage origin; migration must explicitly transfer local preferences and data.

This file records the original audit, not a claim that every finding remains
open or that every recommendation was implemented. Consult tests and current
implementation for the resulting behavior. Watcher tests import pure helpers
and never send desktop notifications.

## Result

The app now uses Preact components and separate API, snapshot-stage, domain,
notification, persistence, and startup modules. Failed required requests leave
the last successful snapshot intact; CI errors reject refresh. Refreshes are
serialized, cached snapshots are versioned and scoped, saved data is validated,
and dashboard REST/GraphQL searches paginate. Search results exceeding GitHub's
1,000-result ceiling produce a visible error instead of silently truncating.

The watcher uses existing CLI credentials in memory, resolves reply ownership,
and expires timestamped history. Its separate GraphQL search still has the
original 100-result limit; it remains an optional one-shot tool. The dashboard's
login service does not enable watcher notifications.

Preact escapes text, links are restricted to HTTPS, and card controls are sibling
buttons. Direct requests stay actionable even when another reviewer approved.
The legacy file exports credential-free preferences and optional notification
history for import into the new browser origin.

Local startup uses macOS launchd and a loopback-only static server. Unit and
fixture-based browser tests cover the resulting behavior. Organizations with
SAML enforcement require SSO-authorized tokens for live organization refreshes.
