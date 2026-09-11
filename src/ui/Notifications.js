import { useState } from "preact/hooks";
import { html, safeUrl, relativeTime } from "./common.js";
import { session, config } from "../config.js";

export function notificationSection(notification) {
  if (
    notification.onMyPR &&
    ["review_approved", "comment_on_my_pr"].includes(notification.type)
  )
    return "needs-you";
  if (notification.isBot) return "activity";
  const username = session.USERNAME.trim();
  if (username) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(`(^|[^a-z0-9-])@${escaped}(?![a-z0-9-])`, "i").test(
        notification.preview || "",
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
    ].includes(notification.type)
  )
    return "needs-you";
  return session.teammates.has(notification.actor) &&
    session.teammates.has(notification.prAuthor)
    ? "teammates"
    : "activity";
}

export function notificationGroups(items) {
  const groups = new Map();
  const detailedEvents = new Set(
    items
      .filter((item) => item.preview?.trim())
      .map((item) => `${item.prId || item.id}:${item.actor || ""}`),
  );
  for (const item of items) {
    if (config.IGNORED_REPOS.has((item.prId || "").split("#")[0])) continue;
    if (item.type === "new_review" && !item.preview?.trim()) continue;
    if (
      ["mentioned", "team_mentioned"].includes(item.type) &&
      !item.preview?.trim() &&
      detailedEvents.has(`${item.prId || item.id}:${item.actor || ""}`)
    )
      continue;
    const key = item.prId || item.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values())
    group.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return [...groups.values()].sort(
    (a, b) =>
      Math.max(...b.map((item) => Date.parse(item.createdAt))) -
      Math.max(...a.map((item) => Date.parse(item.createdAt))),
  );
}

export function notificationActorGroups(events) {
  const groups = new Map();
  for (const event of events) {
    const actor = event.actor || event.prAuthor || "GitHub";
    const key = `${actor}:${event.isBot ? "bot" : "person"}`;
    if (!groups.has(key))
      groups.set(key, {
        actor,
        isBot: event.isBot,
        latestAt: event.createdAt,
        events: [],
      });
    groups.get(key).events.push(event);
  }
  return [...groups.values()].sort(
    (a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt),
  );
}

export const unreadThreadCount = (items) =>
  notificationGroups(items).filter((group) =>
    group.some(
      (notification) =>
        !notification.readAt &&
        notificationSection(notification) !== "activity",
    ),
  ).length;

function ActionTag({ type }) {
  const tag = {
    review_approved: ["approved", "approved"],
    review_changes_requested: ["changes", "changes requested"],
    reply_to_my_comment: ["replied", "replied"],
    comment_on_my_pr: ["commented", "commented"],
    comment_on_watched_pr: ["commented", "commented"],
    new_review: ["reviewed", "reviewed"],
    mentioned: ["mentioned", "mentioned you"],
    team_mentioned: ["mentioned", "mentioned your team"],
    assigned: ["assigned", "assigned you"],
    pr_closed: ["closed", "closed"],
  }[type];
  return tag
    ? html`<span class=${`notif-action-tag tag-${tag[0]}`}>${tag[1]}</span>`
    : null;
}

function SelectionBox({ checked, indeterminate = false, label, onChange }) {
  return html`<label class="notif-check">
    <input
      type="checkbox"
      checked=${checked}
      indeterminate=${indeterminate}
      aria-label=${label}
      onChange=${(event) => onChange(event.currentTarget.checked)}
    />
    <span aria-hidden="true"></span>
  </label>`;
}

function CommentList({ events }) {
  return html`<div class="notif-comments">
    ${events.map(
      (entry) =>
        html`<a
          class="notif-comment"
          href=${safeUrl(entry.commentUrl || entry.prUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          ${entry.preview || "Open notification"}
        </a>`,
    )}
  </div>`;
}

function ActorGroup({ actorGroup }) {
  const types = [...new Set(actorGroup.events.map((event) => event.type))];
  return html`<div class="notif-actor-group">
    <div class="notif-actor-line">
      <span class="notif-actor">${actorGroup.actor}</span>
      ${actorGroup.isBot && html`<span class="bot-label">Bot</span>`}
      ${types.slice(0, 2).map((type) => html`<${ActionTag} type=${type} />`)}
      ${
        actorGroup.events.length > 1 &&
        html`<span class="notif-actor-count"
          >${actorGroup.events.length} updates</span
        >`
      }
      <time class="notif-time">${relativeTime(actorGroup.latestAt)}</time>
    </div>
    <${CommentList} events=${actorGroup.events} />
  </div>`;
}

function Thread({ group, update, selecting, selected, setSelected }) {
  const primary = group[0];
  const ids = group.map((notification) => notification.id);
  const read = group.every((notification) => notification.readAt);
  const pinned = group.some((notification) => notification.pinnedAt);
  return html`<article
    class=${`pr-thread ${read ? "is-read" : ""} ${selected ? "is-selected" : ""}`}
    data-notif-id=${ids.join(",")}
  >
    <div class="notif-thread-topline">
      ${
        selecting &&
        html`<${SelectionBox}
          checked=${selected}
          label=${`Select ${primary.prTitle || "notification group"}`}
          onChange=${setSelected}
        />`
      }
      <a
        class="notif-pr-title"
        href=${safeUrl(primary.prUrl)}
        target="_blank"
        rel="noopener noreferrer"
        >${primary.prTitle || "Pull request"}</a
      >
      <div class="notif-thread-actions">
        <button
          class=${`notif-icon-action ${pinned ? "is-pinned" : ""}`}
          aria-label=${`${pinned ? "Unpin" : "Pin"} ${primary.prTitle || "notification group"}`}
          title=${pinned ? "Unpin" : "Pin"}
          onClick=${() => update(ids, { pinnedAt: pinned ? null : Date.now() })}
        >
          ${pinned ? "Pinned" : "Pin"}
        </button>
        <button
          class="notif-icon-action"
          aria-label=${`${read ? "Mark unread" : "Mark read"}: ${primary.prTitle || "notification group"}`}
          onClick=${() => update(ids, { readAt: read ? null : Date.now() })}
        >
          ${read ? "Unread" : "Read"}
        </button>
      </div>
    </div>
    <div class="notif-actor-groups">
      ${notificationActorGroups(group).map(
        (actorGroup) =>
          html`<${ActorGroup}
            key=${`${primary.prId || primary.id}:${actorGroup.actor}`}
            actorGroup=${actorGroup}
          />`,
      )}
    </div>
  </article>`;
}

function Section({
  sectionKey,
  label,
  groups,
  update,
  selecting,
  selectedGroupKeys,
  setGroupsSelected,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const groupKeys = groups.map((group) => group[0].prId || group[0].id);
  const selected = groupKeys.filter((key) => selectedGroupKeys.has(key)).length;
  const unread = groups.filter((group) =>
    group.some((notification) => !notification.readAt),
  ).length;
  const ids = groups.flatMap((group) => group.map((item) => item.id));
  return html`<section
    class=${`notif-section ${collapsed ? "collapsed" : ""}`}
    id=${`notif-${sectionKey}`}
  >
    <header class="notif-section-header">
      ${
        selecting &&
        html`<${SelectionBox}
          checked=${selected === groupKeys.length}
          indeterminate=${selected > 0 && selected < groupKeys.length}
          label=${`Select all ${label} groups`}
          onChange=${(checked) => setGroupsSelected(groupKeys, checked)}
        />`
      }
      <button
        type="button"
        class="notif-section-toggle"
        aria-expanded=${!collapsed}
        aria-controls=${`notif-${sectionKey}-items`}
        onClick=${() => setCollapsed(!collapsed)}
      >
        <span aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
        <span class="notif-section-title">${label}</span>
        <span class="notif-section-count">${groups.length}</span>
        ${unread > 0 && html`<span class="notif-section-summary">${unread} unread</span>`}
      </button>
      ${
        unread > 0 &&
        html`<button
          class="notif-section-read"
          onClick=${() => update(ids, { readAt: Date.now() })}
        >
          Mark section read
        </button>`
      }
    </header>
    <div class="notif-cards" id=${`notif-${sectionKey}-items`}>
      ${groups.map((group) => {
        const key = group[0].prId || group[0].id;
        return html`<${Thread}
          key=${key}
          group=${group}
          update=${update}
          selecting=${selecting}
          selected=${selectedGroupKeys.has(key)}
          setSelected=${(checked) => setGroupsSelected([key], checked)}
        />`;
      })}
    </div>
  </section>`;
}

export function Notifications({ items, setItems, filter, setFilter }) {
  const [selecting, setSelecting] = useState(false);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState(new Set());
  const update = (ids, patch) =>
    setItems((previous) =>
      previous.map((notification) =>
        ids.includes(notification.id)
          ? { ...notification, ...patch }
          : notification,
      ),
    );
  const setGroupsSelected = (keys, checked) =>
    setSelectedGroupKeys((previous) => {
      const next = new Set(previous);
      for (const key of keys) checked ? next.add(key) : next.delete(key);
      return next;
    });
  const changeFilter = (value) => {
    setSelecting(false);
    setSelectedGroupKeys(new Set());
    setFilter(value);
  };
  const isOld = (notification) =>
    notification.readAt && Date.now() - notification.readAt > 14400000;
  const visible = notificationGroups(
    items.filter((notification) =>
      filter === "unread"
        ? !notification.readAt
        : filter === "read"
          ? notification.readAt && !isOld(notification)
          : filter === "old"
            ? isOld(notification)
            : true,
    ),
  );
  const visibleNotifications = visible.flat();
  const visibleGroupKeys = visible.map((group) => group[0].prId || group[0].id);
  const selectedGroups = visible.filter((group) =>
    selectedGroupKeys.has(group[0].prId || group[0].id),
  );
  const selectedIds = selectedGroups.flatMap((group) =>
    group.map((notification) => notification.id),
  );
  const sectionKeys = ["needs-you", "teammates", "activity"];
  const labels = ["Needs you", "Teammates", "Activity"];
  const finishSelection = () => {
    setSelecting(false);
    setSelectedGroupKeys(new Set());
  };
  return html`<div class="notif-controls">
      <div class="notif-filter-group" aria-label="Notification status">
        ${["unread", "read", "old"].map(
          (value) =>
            html`<button
              class=${`notif-filter-btn ${filter === value ? "active" : ""}`}
              data-notif-filter=${value}
              aria-pressed=${filter === value}
              onClick=${() => changeFilter(value)}
            >
              ${value[0].toUpperCase() + value.slice(1)}
            </button>`,
        )}
      </div>
      <span class="notif-visible-summary"
        >${visible.length}
        ${visible.length === 1 ? "conversation" : "conversations"}</span
      >
      ${
        selecting
          ? html`<div class="notif-selection-tools">
              <${SelectionBox}
                checked=${selectedGroups.length === visible.length && visible.length > 0}
                indeterminate=${selectedGroups.length > 0 && selectedGroups.length < visible.length}
                label="Select all visible conversations"
                onChange=${(checked) => setGroupsSelected(visibleGroupKeys, checked)}
              />
              <strong>${selectedGroups.length} selected</strong>
              <button
                disabled=${!selectedIds.length}
                onClick=${() => {
                  update(selectedIds, { readAt: Date.now() });
                  finishSelection();
                }}
              >
                Mark read
              </button>
              <button
                disabled=${!selectedIds.length}
                onClick=${() => {
                  update(selectedIds, { readAt: null });
                  finishSelection();
                }}
              >
                Mark unread
              </button>
              <button onClick=${finishSelection}>Cancel</button>
            </div>`
          : html`<button
              class="notif-select-mode"
              disabled=${!visible.length}
              onClick=${() => setSelecting(true)}
            >
              Select
            </button>`
      }
      <button
        class="notif-mark-all"
        id="notif-mark-all"
        disabled=${!visibleNotifications.some((notification) => !notification.readAt)}
        onClick=${() =>
          update(
            visibleNotifications
              .filter((notification) => !notification.readAt)
              .map((notification) => notification.id),
            { readAt: Date.now() },
          )}
        }
      >
        Mark visible read
      </button>
    </div>
    <div class="notif-list" id="notif-list">
      ${sectionKeys.map((key, index) => {
        const groups = notificationGroups(
          visibleNotifications.filter(
            (notification) => notificationSection(notification) === key,
          ),
        );
        return groups.length
          ? html`<${Section}
              key=${key}
              sectionKey=${key}
              label=${labels[index]}
              groups=${groups}
              update=${update}
              selecting=${selecting}
              selectedGroupKeys=${selectedGroupKeys}
              setGroupsSelected=${setGroupsSelected}
            />`
          : null;
      })}
      ${
        !visible.length &&
        html`<div class="notif-empty">
          ${
            filter === "unread"
              ? html`You're all caught up.<br /><span
                    >New GitHub activity will appear here.</span
                  >`
              : filter === "old"
                ? "No old notifications."
                : "No read notifications."
          }
        </div>`
      }
    </div>`;
}
