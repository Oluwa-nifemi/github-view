import { html, IconButton, relativeTime } from "./common.js";
import { session } from "../config.js";
import { Auth } from "./Auth.js";
import { useDashboard } from "./useDashboard.js";
import { PRList } from "./PRList.js";
import { Filters } from "./Filters.js";
import { Settings } from "./Settings.js";
import { Notifications, unreadThreadCount } from "./Notifications.js";
export function App() {
  const {
    token,
    snapshot,
    busy,
    error,
    settings,
    setSettings,
    badges,
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
  } = useDashboard();
  return html`<main class="wrap">
    <header>
      <h1>GitHub Digest</h1>
      ${token && html`<div class="controls"><span id="last-refresh">${snapshot ? `Updated ${relativeTime(snapshot.timestamp)}` : "Not refreshed"}</span><${IconButton} label="Refresh" icon="↻" onClick=${refresh} disabled=${busy} /><${IconButton} label="Settings" icon="⚙" onClick=${() => setSettings(true)} /></div>`}
    </header>
    ${
      !token
        ? html`<${Auth} connect=${connect} busy=${busy} error=${error} />`
        : html`<div>
            <nav class="view-tabs" aria-label="Digest views">
              <button
                class=${view === "prs" ? "active" : ""}
                onClick=${() => changeView("prs")}
              >
                Pull Requests</button
              ><button
                class=${view === "notifications" ? "active" : ""}
                onClick=${() => changeView("notifications")}
              >
                Notifications
                <span class="count"
                  >${unreadThreadCount(notifications)}</span
                ></button
              ><span class="account-label">@${session.USERNAME}</span>
            </nav>
            ${error && html`<div class="error-notice" role="alert">${error}${snapshot ? " Your last successful refresh is still shown." : ""}</div>`}
            <div id="summary" aria-live="polite">
              ${busy ? "Refreshing GitHub…" : snapshot ? `${Object.keys(snapshot.prs).length} pull requests · ${Object.keys(badges).length} changed` : "No snapshot yet."}
            </div>
            ${view === "notifications" ? html`<${Notifications} items=${notifications} setItems=${setNotifications} filter=${notifFilter} setFilter=${changeFilter} prefs=${prefs} setPrefs=${setPrefs} />` : html`<${Filters} prs=${snapshot?.prs || {}} authors=${authors} repos=${repos} teamOnly=${teamOnly} setAuthors=${setAuthors} setRepos=${setRepos} setTeamOnly=${setTeamOnly} /><${PRList} prs=${snapshot?.prs || {}} state=${state} action=${action} badges=${badges} setSections=${setSections} setAuthors=${setCollapsedAuthors} />`}
          </div>`
    }${
      settings &&
      html`<${Settings}
        onClose=${() => setSettings(false)}
        onDisconnect=${disconnect}
        onSave=${saveSettings}
      />`
    }
  </main>`;
}
