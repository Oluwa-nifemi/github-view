import { html, safeUrl } from "./common.js";
import { PRCard } from "./PRCard.js";
import { classifyMyPR, isHandledByReview } from "../domain/reviews.js";
import { session, config } from "../config.js";
import { toggle, useStored } from "./state.js";
import { useState, useRef, useEffect } from "preact/hooks";

function TicketGroupLabel({ ticket, name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef();
  const rename = useRef();
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (editing) input.current.focus();
    else if (restoreFocus.current) {
      rename.current.focus();
      restoreFocus.current = false;
    }
  }, [editing]);
  const close = () => {
    restoreFocus.current = true;
    setEditing(false);
  };
  const save = () => {
    onSave(draft.trim());
    close();
  };
  return html`<span class="ticket-group-label">
    ${
      editing
        ? html`<span
            class="ticket-group-editor"
            onClick=${(e) => e.stopPropagation()}
          >
            <input
              ref=${input}
              aria-label=${`Name for ${ticket} group`}
              value=${draft}
              onInput=${(e) => setDraft(e.currentTarget.value)}
              onKeyDown=${(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  if (e.key === "Enter") save();
                  else close();
                }
              }}
            />
            <button type="button" onClick=${save}>Save</button>
            <button type="button" onClick=${close}>Cancel</button>
          </span>`
        : html`<span class="ticket-group-name" title=${ticket}
            >${name || ticket}</span
          >`
    }
    <button
      ref=${rename}
      type="button"
      class="ticket-group-rename"
      hidden=${editing}
      aria-label=${`Rename ${ticket} group`}
      title="Rename group"
      onClick=${(e) => {
        e.stopPropagation();
        setDraft(name || ticket);
        setEditing(true);
      }}
    >
      ✎
    </button>
  </span>`;
}

const sections = [
  ["priority", "3", "⭐", "High Priority"],
  ["mine", "4", "🟢", "Your Open PRs"],
  ["others", "3b", "⚪", "Team Requests — Others"],
  ["handled", "team-handled", "🔵", "Team Handled"],
  ["engaged", "engaged", "💭", "Engaged"],
  ["teammates", "teammates-open", "👥", "Teammates' Open PRs"],
  ["archived", "archive", "📦", "Archived"],
  ["deleted", "deleted", "🗑️", "Deleted"],
];
const latestFirst = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
const sameLogin = (left, right) =>
  !!left && !!right && left.toLowerCase() === right.toLowerCase();

export function bucketForPR(pr, state) {
  if (state.archived[pr.id]?.deleted) return "deleted";
  if (state.archived[pr.id]) return "archived";
  if (state.promoted.includes(pr.id)) return "priority";
  if (sameLogin(pr.author, session.USERNAME)) return "mine";
  if ([1, 2, 3].includes(pr.section))
    return !pr.needsAttention && isHandledByReview(pr)
      ? "handled"
      : session.teammates.has(pr.author) || pr.authorIsTeammate
        ? "priority"
        : "others";
  return { 4: "mine", 5: "handled", 6: "engaged", 7: "teammates" }[pr.section];
}

export function PRList({
  prs,
  state,
  action,
  badges,
  setSections,
  setAuthors,
}) {
  const [ticketNames, setTicketNames] = useStored("gh_digest_ticket_names", {});
  const buckets = Object.fromEntries(sections.map(([key]) => [key, []]));
  for (const pr of Object.values(prs)) {
    if (
      !pr ||
      typeof pr.id !== "string" ||
      (config.ORG && !pr.repo?.startsWith(`${config.ORG}/`)) ||
      config.IGNORED_REPOS.has(pr.repo)
    )
      continue;
    if (state.repos.length && !state.repos.includes(pr.repo)) continue;
    if (
      (state.teamOnly || state.authors.length) &&
      !(
        state.teamOnly &&
        (session.teammates.has(pr.author) || pr.authorIsTeammate)
      ) &&
      !state.authors.includes(pr.author)
    )
      continue;
    const key = bucketForPR(pr, state);
    if (key) buckets[key].push(pr);
  }
  const pinnedFirst = (a, b) =>
    Number(state.promoted.includes(b.id)) -
      Number(state.promoted.includes(a.id)) ||
    new Date(a.createdAt) - new Date(b.createdAt);
  for (const [key, list] of Object.entries(buckets))
    list.sort(["priority", "others"].includes(key) ? pinnedFirst : latestFirst);
  const cards = (list) =>
    list.map(
      (pr) =>
        html`<${PRCard}
          key=${pr.id}
          pr=${pr}
          state=${state}
          action=${action}
          badge=${badges[pr.id]}
        />`,
    );
  const archiveGroup = (label, list, className = "my-archive-group") =>
    html`<details
      class=${className}
      style=${list.length ? undefined : { display: "none" }}
    >
      <summary>${label} <span class="count">${list.length}</span></summary>
      <div class="subgroup-body">${cards(list)}</div>
    </details>`;
  return sections.map(([key, id, icon, label]) => {
    const list = buckets[key];
    let content = cards(list),
      count = list.length;
    if (key === "priority") {
      const pinned = list
        .filter((pr) => state.promoted.includes(pr.id))
        .sort((a, b) => Number(a.isDraft) - Number(b.isDraft));
      const drafts = list.filter(
        (pr) => pr.isDraft && !state.promoted.includes(pr.id),
      );
      const active = list.filter(
        (pr) => !pr.isDraft && !state.promoted.includes(pr.id),
      );
      count = active.length + pinned.length;
      const authorMap = new Map();
      for (const pr of active) {
        const author = pr.author || "unknown";
        if (!authorMap.has(author))
          authorMap.set(author, {
            author,
            avatar: pr.authorAvatar,
            prs: [],
            hasDirectRequest: false,
            latestUpdate: pr.updatedAt,
          });
        const group = authorMap.get(author);
        group.prs.push(pr);
        if (pr.isDirect && !pr.reviewedBefore) group.hasDirectRequest = true;
        if (pr.updatedAt > group.latestUpdate)
          group.latestUpdate = pr.updatedAt;
      }
      const groups = [...authorMap.values()].sort(
        (a, b) =>
          Number(b.hasDirectRequest) - Number(a.hasDirectRequest) ||
          new Date(b.latestUpdate) - new Date(a.latestUpdate),
      );
      content = html`<div class="priority-pinned">${cards(pinned)}</div>
        <div class="priority-author-groups">
          ${groups.map(
            (group) =>
              html`<details
                class="author-group"
                data-author=${group.author}
                open=${!state.collapsedAuthors.includes(group.author)}
                onToggle=${(e) => {
                  if (
                    e.currentTarget.open ===
                    state.collapsedAuthors.includes(group.author)
                  )
                    setAuthors(toggle(state.collapsedAuthors, group.author));
                }}
              >
                <summary>
                  ${safeUrl(group.avatar) && html`<img class="avatar" src=${safeUrl(group.avatar)} alt="" loading="lazy" />`}${group.author}
                  <span class="count">${group.prs.length}</span>
                </summary>
                <div class="author-group-body">
                  ${cards(group.prs.sort(latestFirst))}
                </div>
              </details>`,
          )}
        </div>
        ${archiveGroup("✎ Drafts", drafts, "my-archive-group priority-drafts-group")}`;
    }
    if (key === "mine") {
      const active = list.filter((pr) => !state.stashed[pr.id]);
      const tickets = new Map();
      for (const pr of active) {
        const ticket = pr.title?.match(/\b[A-Z][A-Z0-9]*-\d+\b/)?.[0];
        if (!ticket) continue;
        if (!tickets.has(ticket)) tickets.set(ticket, []);
        tickets.get(ticket).push(pr);
      }
      const groups = [...tickets.entries()].filter(([, prs]) => prs.length > 1);
      const groupedIds = new Set(
        groups.flatMap(([, prs]) => prs.map((pr) => pr.id)),
      );
      content = html`${groups.map(([ticket, prs]) => {
        const groupKey = `jira:${ticket}`;
        return html`<details
          key=${ticket}
          class="author-group"
          data-ticket=${ticket}
          open=${!state.collapsedAuthors.includes(groupKey)}
          onToggle=${(e) => {
            if (
              e.currentTarget.open === state.collapsedAuthors.includes(groupKey)
            )
              setAuthors(toggle(state.collapsedAuthors, groupKey));
          }}
        >
          <summary>
            <${TicketGroupLabel}
              ticket=${ticket}
              name=${ticketNames[ticket]}
              onSave=${(name) =>
                setTicketNames((previous) => {
                  const next = { ...previous };
                  if (name && name !== ticket) next[ticket] = name;
                  else delete next[ticket];
                  return next;
                })}
            />
            <span class="count">${prs.length}</span>
          </summary>
          <div class="author-group-body">${cards(prs)}</div>
        </details>`;
      })}${Object.entries({
        ci_failing: "❌ CI failing",
        changes_requested: "💬 Changes requested",
        approved: "✅ Approved — ready to merge",
        awaiting: "⏳ Awaiting review",
      }).map(([status, title]) => {
        const items = active
          .filter((pr) => !groupedIds.has(pr.id) && classifyMyPR(pr) === status)
          .sort(latestFirst);
        const groupKey = `my-status:${status}`;
        return html`<details
          key=${status}
          class="subgroup my-archive-group"
          data-status=${status}
          style=${items.length ? undefined : { display: "none" }}
          open=${!state.collapsedAuthors.includes(groupKey)}
          onToggle=${(e) => {
            if (
              e.currentTarget.open === state.collapsedAuthors.includes(groupKey)
            )
              setAuthors(toggle(state.collapsedAuthors, groupKey));
          }}
        >
          <summary>${title} <span class="count">${items.length}</span></summary>
          <div class="subgroup-body">${cards(items)}</div>
        </details>`;
      })}${archiveGroup("🗄 Set aside", list.filter((pr) => state.stashed[pr.id]).sort(latestFirst))}`;
    }
    if (key === "teammates") {
      const repoMap = new Map();
      for (const pr of list) {
        if (!repoMap.has(pr.repo)) repoMap.set(pr.repo, []);
        repoMap.get(pr.repo).push(pr);
      }
      content = [...repoMap.entries()]
        .sort(
          (a, b) => new Date(b[1][0].updatedAt) - new Date(a[1][0].updatedAt),
        )
        .map(([repo, prs]) => {
          const groupKey = `repo:${repo}`;
          return html`<details
            class="author-group"
            data-repo=${repo}
            open=${!state.collapsedAuthors.includes(groupKey)}
            onToggle=${(e) => {
              if (
                e.currentTarget.open ===
                state.collapsedAuthors.includes(groupKey)
              )
                setAuthors(toggle(state.collapsedAuthors, groupKey));
            }}
          >
            <summary>
              ${repo.split("/").pop()}
              <span class="count">${prs.length}</span>
            </summary>
            <div class="author-group-body">${cards(prs)}</div>
          </details>`;
        });
    }
    const collapsed = !!state.sections[key];
    const toggleSection = () =>
      setSections({ ...state.sections, [key]: !collapsed });
    return html`<section
      key=${key}
      class=${`section collapsible${collapsed ? " collapsed" : ""}`}
      id=${`section-${id}`}
    >
      <h2
        role="button"
        tabindex="0"
        aria-expanded=${!collapsed}
        onClick=${toggleSection}
        onKeyDown=${(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSection();
          }
        }}
      >
        <span>${icon}</span> ${label} <span class="count">${count}</span
        ><span class="toggle">${collapsed ? "▸ expand" : "▾ collapse"}</span>
      </h2>
      <div class="cards" data-section=${id}>${content}</div>
    </section>`;
  });
}
