import { html, safeUrl, relativeTime, IconButton } from "./common.js";
import { session, config } from "../config.js";
const sections = ["Needs You", "Teammates", "Activity"];
const verbs = {
  review_approved: "approved",
  review_changes_requested: "requested changes",
  comment_on_my_pr: "commented",
  comment_on_watched_pr: "commented",
  reply_to_my_comment: "replied to you",
  direct_request: "requested your review",
  new_review: "reviewed",
  mentioned: "mentioned you",
  pr_closed: "closed or merged",
  assigned: "assigned you",
  team_mentioned: "mentioned a team",
};
export function notificationSection(n) {
  if (n.isBot) return "Activity";
  if (
    [
      "reply_to_my_comment",
      "review_changes_requested",
      "mentioned",
      "assigned",
    ].includes(n.type) ||
    (n.onMyPR && ["review_approved", "comment_on_my_pr"].includes(n.type))
  )
    return "Needs You";
  const escaped = session.USERNAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    escaped &&
    new RegExp(`(^|[^a-z0-9-])@${escaped}(?![a-z0-9-])`, "i").test(
      n.preview || "",
    )
  )
    return "Needs You";
  return session.teammates.has(n.actor) && session.teammates.has(n.prAuthor)
    ? "Teammates"
    : "Activity";
}
export function notificationGroups(items) {
  const groups = new Map();
  for (const item of items) {
    if (config.IGNORED_REPOS.has(item.prId.split("#")[0])) continue;
    const id = item.prId || item.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  }
  return [...groups.values()]
    .map((group) =>
      group.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    )
    .sort((a, b) => Date.parse(b[0].createdAt) - Date.parse(a[0].createdAt));
}
export const unreadThreadCount = (items) =>
  notificationGroups(items).filter((group) =>
    group.some((n) => !n.readAt && !n.isBot),
  ).length;
function Thread({ group, update }) {
  const n = group[0],
    ids = group.map((item) => item.id),
    read = group.every((item) => item.readAt),
    pinned = group.some((item) => item.pinnedAt);
  const latest = group.find((item) => !item.isBot) || n;
  return html`<article
    class=${`card notification-thread ${read ? "is-read" : ""}`}
  >
    <div class="card-toolbar">
      <${IconButton}
        label=${read ? "Mark unread" : "Mark read"}
        icon=${read ? "○" : "✓"}
        onClick=${() => update(ids, { readAt: read ? null : Date.now() })}
      /><${IconButton}
        label=${pinned ? "Unpin notification" : "Pin notification"}
        icon="⌖"
        active=${pinned}
        onClick=${() => update(ids, { pinnedAt: pinned ? null : Date.now() })}
      />
    </div>
    <a
      class="pr-link"
      href=${safeUrl(n.prUrl)}
      target="_blank"
      rel="noopener noreferrer"
      >${n.prTitle || n.prId}</a
    >
    <div class="card-meta">${n.prId}</div>
    <details class="notification-timeline">
      <summary>
        <strong>${latest.actor || "GitHub"}</strong>
        ${latest.isBot && html`<span class="chip">Bot</span>`}
        ${verbs[latest.type] || "updated this PR"}
        <span class="muted"
          >${relativeTime(latest.createdAt)} · ${group.length}
          ${group.length === 1 ? "event" : "events"}</span
        >
      </summary>
      ${group.map((event) => html`<div class="notification-event"><strong>${event.actor || "GitHub"}</strong> ${event.isBot && html`<span class="chip">Bot</span>`} <span>${verbs[event.type] || "updated this PR"}</span><time>${relativeTime(event.createdAt)}</time>${event.path && html`<div class="card-meta">${event.path}${event.line ? `:${event.line}` : ""}</div>`}${event.preview && html`<p><a href=${safeUrl(event.commentUrl || event.prUrl)} target="_blank" rel="noopener noreferrer">${event.preview}</a></p>`}</div>`)}
    </details>
  </article>`;
}
export function Notifications({
  items,
  setItems,
  filter,
  setFilter,
  prefs,
  setPrefs,
}) {
  const update = (ids, patch) =>
    setItems((previous) =>
      previous.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)),
    );
  const old = (n) => n.readAt && Date.now() - n.readAt > 14400000;
  const visible = notificationGroups(items).filter((group) =>
    filter === "unread"
      ? group.some((n) => !n.readAt)
      : filter === "read"
        ? group.every((n) => n.readAt) && group.some((n) => !old(n))
        : filter === "old"
          ? group.every((n) => old(n))
          : filter === "pinned"
            ? group.some((n) => n.pinnedAt)
            : true,
  );
  return html`<div>
    <div class="filters">
      ${["unread", "read", "old", "all", "pinned"].map((value) => html`<button class=${filter === value ? "active" : ""} onClick=${() => setFilter(value)}>${value[0].toUpperCase() + value.slice(1)}</button>`)}<button
        disabled=${items.every((n) => n.readAt)}
        onClick=${() => setItems((previous) => previous.map((n) => ({ ...n, readAt: n.readAt || Date.now() })))}
      >
        Mark all read
      </button>
    </div>
    ${sections.map((section) => {
      const groups = visible.filter(
        (group) =>
          sections.find((candidate) =>
            group.some((n) => notificationSection(n) === candidate),
          ) === section,
      );
      if (!groups.length) return null;
      return html`<section class="section">
        <h2>
          <button
            class="section-toggle"
            aria-expanded=${!prefs[section]}
            onClick=${() => setPrefs({ ...prefs, [section]: !prefs[section] })}
          >
            ${section}<span class="count">${groups.length}</span
            ><span class="toggle">${prefs[section] ? "+" : "−"}</span>
          </button>
        </h2>
        ${!prefs[section] && html`<div class="cards">${groups.map((group) => html`<${Thread} key=${group[0].prId} group=${group} update=${update} />`)}</div>`}
      </section>`;
    })}${!visible.length && html`<p class="empty-state">${filter === "unread" ? "You’re all caught up." : `No ${filter === "all" ? "" : filter} notifications.`}</p>`}
  </div>`;
}
