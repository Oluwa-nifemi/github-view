import { html } from "./common.js";
import { PRCard } from "./PRCard.js";
import { classifyMyPR, isHandledByReview } from "../domain/reviews.js";
import { session, config } from "../config.js";
import { toggle } from "./state.js";

const labels = {
  priority: "High Priority",
  others: "Team Requests",
  mine: "My Pull Requests",
  handled: "Handled by Team",
  engaged: "Previously Engaged",
  teammates: "Teammates’ Open PRs",
  archived: "Archived",
  deleted: "Deleted",
};
export function PRList({
  prs,
  state,
  action,
  badges,
  setSections,
  setAuthors,
}) {
  const buckets = Object.fromEntries(
    Object.keys(labels).map((key) => [key, []]),
  );
  for (const pr of Object.values(prs)) {
    if (
      !pr ||
      typeof pr.id !== "string" ||
      !pr.repo?.startsWith(`${config.ORG}/`)
    )
      continue;
    if (config.IGNORED_REPOS.has(pr.repo)) continue;
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
  const group = (label, list) =>
    list.length
      ? html`<div class="subgroup">
          <h3>${label} (${list.length})</h3>
          ${cards(list)}
        </div>`
      : null;
  return Object.entries(labels).map(([key, label]) => {
    const list = buckets[key].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    let content = cards(list);
    if (key === "priority") {
      const pinned = list.filter((pr) => state.promoted.includes(pr.id));
      const active = list.filter(
        (pr) => !state.promoted.includes(pr.id) && !pr.isDraft,
      );
      const authors = [...new Set(active.map((pr) => pr.author))].sort(
        (a, b) =>
          Number(active.some((pr) => pr.author === b && pr.isDirect)) -
          Number(active.some((pr) => pr.author === a && pr.isDirect)),
      );
      content = html`${cards(pinned)}${authors.map(
        (author) =>
          html`<details
            class="author-group"
            open=${!state.collapsedAuthors.includes(author)}
            onToggle=${(e) => {
              if (
                e.currentTarget.open === state.collapsedAuthors.includes(author)
              )
                setAuthors(toggle(state.collapsedAuthors, author));
            }}
          >
            <summary>
              ${author}<span class="count"
                >${active.filter((pr) => pr.author === author).length}</span
              >
            </summary>
            ${cards(active.filter((pr) => pr.author === author))}
          </details>`,
      )}${group(
        "Drafts",
        list.filter((pr) => pr.isDraft && !state.promoted.includes(pr.id)),
      )}`;
    }
    if (key === "mine") {
      const active = list.filter((pr) => !state.stashed[pr.id]);
      content = html`${Object.entries({
        ci_failing: "CI Failing",
        changes_requested: "Changes Requested",
        approved: "Approved",
        awaiting: "Awaiting Review",
      }).map(([status, name]) =>
        group(
          name,
          active.filter((pr) => classifyMyPR(pr) === status),
        ),
      )}${group(
        "Set Aside",
        list.filter((pr) => state.stashed[pr.id]),
      )}`;
    }
    return html`<section class="section" key=${key}>
      <h2>
        <button
          class="section-toggle"
          aria-expanded=${!state.sections[key]}
          onClick=${() => setSections({ ...state.sections, [key]: !state.sections[key] })}
        >
          ${label}<span class="count">${list.length}</span
          ><span class="toggle">${state.sections[key] ? "+" : "−"}</span>
        </button>
      </h2>
      ${!state.sections[key] && html`<div class="cards">${content}</div>`}
    </section>`;
  });
}
