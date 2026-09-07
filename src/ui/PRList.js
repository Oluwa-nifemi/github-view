import { html, safeUrl } from "./common.js";
import { PRCard } from "./PRCard.js";
import { classifyMyPR, isHandledByReview } from "../domain/reviews.js";
import { session, config } from "../config.js";
import { toggle } from "./state.js";

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
export function PRList({
  prs,
  state,
  action,
  badges,
  setSections,
  setAuthors,
}) {
  const buckets = Object.fromEntries(sections.map(([key]) => [key, []]));
  for (const pr of Object.values(prs)) {
    if (
      !pr ||
      typeof pr.id !== "string" ||
      !pr.repo?.startsWith(`${config.ORG}/`) ||
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
    let key;
    if (state.archived[pr.id]?.deleted) key = "deleted";
    else if (state.archived[pr.id]) key = "archived";
    else if (state.promoted.includes(pr.id)) key = "priority";
    else if ([1, 2, 3].includes(pr.section))
      key =
        !pr.needsAttention && isHandledByReview(pr)
          ? "handled"
          : session.teammates.has(pr.author) || pr.authorIsTeammate
            ? "priority"
            : "others";
    else
      key = { 4: "mine", 5: "handled", 6: "engaged", 7: "teammates" }[
        pr.section
      ];
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
      content = html`${Object.entries({
        ci_failing: "❌ CI failing",
        changes_requested: "💬 Changes requested",
        approved: "✅ Approved — ready to merge",
        awaiting: "⏳ Awaiting review",
      }).map(([status, title]) => {
        const items = active
          .filter((pr) => classifyMyPR(pr) === status)
          .sort(latestFirst);
        return html`<div
          class="subgroup"
          data-status=${status}
          style=${items.length ? undefined : { display: "none" }}
        >
          <h3>${title}</h3>
          <div class="subgroup-body">${cards(items)}</div>
        </div>`;
      })}${archiveGroup("🗄 Set aside", list.filter((pr) => state.stashed[pr.id]).sort(latestFirst))}`;
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
