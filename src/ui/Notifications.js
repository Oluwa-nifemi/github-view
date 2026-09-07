import { useState } from "preact/hooks";
import { html, safeUrl, relativeTime } from "./common.js";
import { session, config } from "../config.js";

export function notificationSection(n) {
  if (n.isBot) return "activity";
  const username = session.USERNAME.trim();
  if (username) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(`(^|[^a-z0-9-])@${escaped}(?![a-z0-9-])`, "i").test(
        n.preview || "",
      )
    )
      return "needs-you";
  }
  if (
    [
      "reply_to_my_comment",
      "review_changes_requested",
      "mentioned",
      "assigned",
    ].includes(n.type)
  )
    return "needs-you";
  if (n.onMyPR && ["review_approved", "comment_on_my_pr"].includes(n.type))
    return "needs-you";
  return session.teammates.has(n.actor) && session.teammates.has(n.prAuthor)
    ? "teammates"
    : "activity";
}

export function notificationGroups(items) {
  const groups = new Map();
  for (const item of items) {
    if (config.IGNORED_REPOS.has((item.prId || "").split("#")[0])) continue;
    const key = item.prId || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Math.max(...b.map((n) => Date.parse(n.createdAt))) -
      Math.max(...a.map((n) => Date.parse(n.createdAt))),
  );
}
export const unreadThreadCount = (items) =>
  notificationGroups(items).filter((group) =>
    group.some((n) => !n.readAt && !n.isBot),
  ).length;

function ActionTag({ type }) {
  const tag = {
    review_approved: ["approved", "approved"],
    review_changes_requested: ["changes", "changes requested"],
    reply_to_my_comment: ["replied", "replied"],
    mentioned: ["mentioned", "mentioned"],
    assigned: ["assigned", "assigned"],
  }[type];
  return tag
    ? html`<span class=${`notif-action-tag tag-${tag[0]}`}>${tag[1]}</span>`
    : null;
}
function groupByAuthor(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.isBot
      ? `bot:${event.actor || "bot"}`
      : event.actor || "unknown";
    if (!groups.has(key))
      groups.set(key, { actor: event.actor, isBot: event.isBot, events: [] });
    groups.get(key).events.push(event);
  }
  return [...groups.values()];
}
function Thread({ group, update }) {
  const [expanded, setExpanded] = useState(false);
  const primary = group[0],
    ids = group.map((n) => n.id),
    read = group.every((n) => n.readAt),
    pinned = group.some((n) => n.pinnedAt);
  const repoLabel = (primary.prId || "").split("/").pop();
  const latest = group.find((n) => !n.isBot) || primary;
  const toggle = (event) => {
    if (event.target.closest("a, .notif-action-btn")) return;
    setExpanded(!expanded);
  };
  return html`<div
    class=${`pr-thread ${read ? "is-read" : ""} ${expanded ? "expanded" : ""}`}
    data-notif-id=${ids.join(",")}
  >
    <div class="pr-row" onClick=${toggle}>
      <div class="pr-body">
        <div class="pr-line1">
          <span class="pr-title">${primary.prTitle || ""}</span
          ><span class="pr-repo"
            ><a
              href=${safeUrl(primary.prUrl)}
              target="_blank"
              rel="noopener noreferrer"
              >${repoLabel}</a
            ></span
          >
        </div>
        <div class="pr-latest">
          <span class="pr-repo-link"
            ><a
              href=${safeUrl(primary.prUrl)}
              target="_blank"
              rel="noopener noreferrer"
              >${repoLabel}</a
            ></span
          ><span class="sep">·</span
          ><span class="th-actor">${latest.actor || "someone"}</span>
          <${ActionTag} type=${latest.type} />
          ${latest.preview && html`<span class="snippet">${latest.preview}</span>`}
          ${group.length > 1 && html`<span class="more-count">+${group.length - 1}</span>`}
        </div>
      </div>
      <div class="notif-actions">
        <button
          class=${`notif-action-btn ${pinned ? "is-pinned" : ""}`}
          data-notif-action=${pinned ? "unpin" : "pin"}
          data-notif-ids=${ids.join(",")}
          onClick=${() => update(ids, { pinnedAt: pinned ? null : Date.now() })}
        >
          ${pinned ? "Unpin" : "Pin"}
        </button>
        <button
          class="notif-action-btn"
          data-notif-action=${read ? "unread" : "read"}
          data-notif-ids=${ids.join(",")}
          onClick=${() => update(ids, { readAt: read ? null : Date.now() })}
        >
          ${read ? "Mark unread" : "Mark read"}
        </button>
      </div>
      <div class="pr-meta">
        <span class="notif-time">${relativeTime(primary.createdAt)}</span>
      </div>
    </div>
    <div class="pr-timeline">
      ${groupByAuthor(group).map(
      (author) =>
        html`<div class="tl-author-group">
          <div class="tl-author-header">
            <span class="tl-actor">${author.actor || "someone"}</span
            >${author.isBot && html` <span class="bot-label">Bot</span>`}
            <${ActionTag} type=${author.events[0].type} /><span
              class="tl-time"
              style=${{ marginLeft: "auto" }}
              >${relativeTime(author.events[0].createdAt)}</span
            >
          </div>
          ${author.events.filter((event) => event.preview).map((event) => html`<div class="tl-comment"><a href=${safeUrl(event.commentUrl || event.prUrl)} target="_blank" rel="noopener noreferrer">${event.preview}</a></div>`)}
        </div>`,
    )}
    </div>
  </div>`;
}
function Section({ label, groups, update }) {
  const [collapsed, setCollapsed] = useState(false);
  return html`<div
    class=${`notif-section ${collapsed ? "collapsed" : ""}`}
    id=${`notif-${label.toLowerCase().replace(/\s+/g, "-")}`}
  >
    <h2 onClick=${() => setCollapsed(!collapsed)}>
      ${label} <span class="collapse-btn"></span>
    </h2>
    <div class="notif-cards">
      ${groups.map((group) => html`<${Thread} key=${group[0].prId || group[0].id} group=${group} update=${update} />`)}
    </div>
  </div>`;
}
export function Notifications({ items, setItems, filter, setFilter }) {
  const update = (ids, patch) =>
    setItems((previous) =>
      previous.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)),
    );
  const isOld = (n) => n.readAt && Date.now() - n.readAt > 14400000;
  const visible = notificationGroups(items).filter((group) =>
    filter === "unread"
      ? group.some((n) => !n.readAt)
      : filter === "read"
        ? group.every((n) => n.readAt) && group.some((n) => !isOld(n))
        : filter === "old"
          ? group.every((n) => n.readAt) && group.every(isOld)
          : true,
  );
  const sectionKeys = ["needs-you", "teammates", "activity"],
    labels = ["Needs you", "Teammates", "Activity"];
  return html`<div class="notif-controls">
      ${["unread", "read", "old"].map((value) => html`<button class=${`notif-filter-btn ${filter === value ? "active" : ""}`} data-notif-filter=${value} onClick=${() => setFilter(value)}>${value[0].toUpperCase() + value.slice(1)}</button>`)}
      <button
        class="notif-mark-all"
        id="notif-mark-all"
        disabled=${items.every((n) => n.readAt)}
        onClick=${() => setItems((previous) => previous.map((n) => ({ ...n, readAt: n.readAt || Date.now() })))}
      >
        Mark all read
      </button>
    </div>
    <div class="notif-list" id="notif-list">
      ${sectionKeys.map((key, index) => {
      const groups = visible.filter(
        (group) =>
          sectionKeys.find((candidate) =>
            group.some((n) => notificationSection(n) === candidate),
          ) === key,
      );
      return groups.length
        ? html`<${Section}
            key=${key}
            label=${labels[index]}
            groups=${groups}
            update=${update}
          />`
        : null;
    })}
      ${!visible.length && html`<div class="notif-empty">${filter === "unread" ? html`You're all caught up.<br /><span style=${{ fontSize: "12px" }}>New PR activity will appear here.</span>` : filter === "old" ? "No old notifications." : "No read notifications."}</div>`}
    </div>`;
}
