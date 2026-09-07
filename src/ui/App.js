import { html, relativeTime } from "./common.js";
import { useEffect, useState } from "preact/hooks";
import { Auth } from "./Auth.js";
import { useDashboard } from "./useDashboard.js";
import { PRList } from "./PRList.js";
import { Filters } from "./Filters.js";
import { Settings } from "./Settings.js";
import { Notifications, unreadThreadCount } from "./Notifications.js";

function Summary({ badges, previousTimestamp }) {
  const counts = { NEW: 0, UPDATED: 0, "NEW-REVIEW": 0 };
  for (const badge of Object.values(badges))
    counts[badge] = (counts[badge] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const since = previousTimestamp
    ? relativeTime(previousTimestamp)
    : "first load";
  const parts = [];
  if (counts.NEW) parts.push(`${counts.NEW} new`);
  if (counts.UPDATED) parts.push(`${counts.UPDATED} updated`);
  if (counts["NEW-REVIEW"]) parts.push(`${counts["NEW-REVIEW"]} new review`);
  return html`<div
    id="summary"
    class=${total ? "has-changes" : ""}
    aria-live="polite"
  >
    ${
      total
        ? `${total} change${total > 1 ? "s" : ""} since last refresh (${since}): ${parts.join(", ")}.`
        : `No changes since last refresh (${since}).`
    }
  </div>`;
}

export function App() {
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setClock((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const dashboard = useDashboard();
  const {
    token,
    snapshot,
    busy,
    error,
    settings,
    setSettings,
    badges,
    previousTimestamp,
    view,
    notifFilter,
    authors,
    repos,
    teamOnly,
    notifications,
    setNotifications,
    prefs,
    setPrefs,
    connect,
    disconnect,
    refresh,
    saveSettings,
    setTeamOnly,
    changeView,
    changeFilter,
    setAuthors,
    setRepos,
    state,
    action,
    setSections,
    setCollapsedAuthors,
  } = dashboard;
  const unread = unreadThreadCount(notifications);
  const signOut = () => {
    if (confirm("Forget token and snapshot? (filters preserved)")) disconnect();
  };
  return html`<div class="wrap">
    ${
      !token
        ? html`<${Auth} connect=${connect} busy=${busy} error=${error} />`
        : html`<div id="app">
            <header>
              <h1>GitHub Digest</h1>
              <div class="controls">
                <span id="last-refresh"
                  >${snapshot ? `Last refreshed ${relativeTime(snapshot.timestamp)}` : "—"}</span
                >
                <span id="spinner" class=${busy ? "spinning" : ""}></span>
                <button
                  id="refresh-btn"
                  class="primary"
                  onClick=${refresh}
                  disabled=${busy}
                >
                  Refresh
                </button>
                <button
                  id="settings-btn"
                  class="icon-button"
                  title="Settings"
                  aria-label="Settings"
                  onClick=${() => setSettings(true)}
                >
                  ⚙
                </button>
                <button id="logout-btn" title="Forget token" onClick=${signOut}>
                  Sign out
                </button>
              </div>
            </header>
            ${snapshot && html`<${Summary} badges=${badges} previousTimestamp=${previousTimestamp} />`}
            <div id="error-bar" class="error-bar" role="alert" hidden=${!error}>
              ${error}${error && snapshot ? " Your last successful refresh is still shown." : ""}
            </div>
            <div class="view-tabs" id="view-tabs">
              <button
                class=${`view-tab ${view === "prs" ? "active" : ""}`}
                data-view="prs"
                onClick=${() => changeView("prs")}
              >
                PRs
              </button>
              <button
                class=${`view-tab ${view === "notifications" ? "active" : ""}`}
                data-view="notifications"
                onClick=${() => changeView("notifications")}
              >
                Notifications
                <span class="notif-badge" id="notif-badge"
                  >${unread || ""}</span
                >
              </button>
            </div>
            <div
              id="notifications-view"
              class=${view === "notifications" ? "active" : ""}
            >
              <${Notifications}
                items=${notifications}
                setItems=${setNotifications}
                filter=${notifFilter}
                setFilter=${changeFilter}
                prefs=${prefs}
                setPrefs=${setPrefs}
              />
            </div>
            <div
              id="prs-view"
              class=${view === "notifications" ? "hidden" : ""}
            >
              <${Filters}
                prs=${snapshot?.prs || {}}
                authors=${authors}
                repos=${repos}
                teamOnly=${teamOnly}
                setAuthors=${setAuthors}
                setRepos=${setRepos}
                setTeamOnly=${setTeamOnly}
              />
              <${PRList}
                prs=${snapshot?.prs || {}}
                state=${state}
                action=${action}
                badges=${badges}
                setSections=${setSections}
                setAuthors=${setCollapsedAuthors}
              />
              <div class="footer-note">
                Background notifications are handled by the watcher in
                <code>.gh-digest/</code> — this dashboard is read-only.
              </div>
            </div>
            ${settings && html`<${Settings} onClose=${() => setSettings(false)} onDisconnect=${signOut} onSave=${saveSettings} />`}
          </div>`
    }
  </div>`;
}
