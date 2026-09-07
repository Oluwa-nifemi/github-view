import { useState } from "preact/hooks";
import { html, IconButton, safeUrl, relativeTime } from "./common.js";
import { latestNonCommentReviewsByReviewer } from "../domain/reviews.js";
import { session } from "../config.js";

export function PRCard({ pr, state, action, badge }) {
  const [editing, setEditing] = useState(false);
  const note = state.notes[pr.id]?.text || "";
  const [draft, setDraft] = useState(note);
  const archived = !!state.archived[pr.id],
    deleted = state.archived[pr.id]?.deleted;
  const pinned = state.promoted.includes(pr.id),
    stashed = !!state.stashed[pr.id];
  const stale =
    Date.now() - Date.parse(pr.updatedAt || pr.createdAt) > 30 * 86400000;
  const reviews = [
    ...latestNonCommentReviewsByReviewer(
      pr.reviews || [],
      pr.author,
      pr.pendingReviewerLogins,
    ).values(),
  ];
  const approved = reviews.filter((r) => r.state === "APPROVED");
  const changes = reviews.filter((r) => r.state === "CHANGES_REQUESTED");
  const myReview = [...(pr.reviews || [])]
    .filter((r) => r.user === session.USERNAME)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
  const changed =
    pr.section !== 4 &&
    myReview?.commitId &&
    pr.headSha &&
    myReview.commitId !== pr.headSha;
  return html`<article
    class=${`card ${stale ? "stale" : ""} ${pr.isDraft ? "is-draft" : ""} ${archived ? "archived" : ""} ${stashed ? "archived-mine" : ""} ${pinned ? "is-promoted" : ""} ${badge ? `is-${badge.toLowerCase()}` : ""}`}
    data-pr-id=${pr.id}
  >
    <div class="card-toolbar">
      ${badge && html`<span class="badge">${badge}</span>`}
      <${IconButton}
        label="Edit note"
        icon="✎"
        onClick=${() => {
          setDraft(note);
          setEditing(!editing);
        }}
      />
      ${!archived && html`<${IconButton} label=${pinned ? "Unpin from High Priority" : "Pin to High Priority"} icon="⌖" active=${pinned} onClick=${() => action("pin", pr)} />`}
      ${pr.section === 4 && !archived && html`<${IconButton} label=${stashed ? "Move back to active list" : "Set aside for later"} icon=${stashed ? "↶" : "▣"} onClick=${() => action("stash", pr)} />`}
      <${IconButton}
        label=${archived ? "Restore" : "Archive"}
        icon=${archived ? "↶" : "×"}
        onClick=${() => action(archived ? "restore" : "archive", pr)}
      />
      ${archived && !deleted && html`<${IconButton} label="Delete permanently from digest" icon="⌫" onClick=${() => action("delete", pr)} />`}
    </div>
    <a
      class="pr-link"
      href=${safeUrl(pr.url)}
      target="_blank"
      rel="noopener noreferrer"
      ><div class="card-title">${pr.title}</div></a
    >
    <div class="chips status-summary">
      ${pr.isDirect && html`<span class="yours">requested you</span>`}
      ${changed && html`<span class="changes">changed since review</span>`}
      ${!changed && myReview?.state === "APPROVED" && html`<span class="yours">you approved</span>`}
      ${pr.isDraft && html`<span>DRAFT</span>`}
      ${approved.length > 0 && html`<span class="approved" title=${approved.map((r) => r.user).join(", ")}>${approved.length} approved</span>`}
      ${changes.length > 0 && html`<span class="changes" title=${changes.map((r) => r.user).join(", ")}>${changes.length} changes requested</span>`}
      ${pr.pendingReviewers > 0 && html`<span class="pending">${pr.pendingReviewers} pending</span>`}
      ${pr.ciFailing && html`<span class="chip ci-fail">CI failing</span>`}
      ${pr.teammateReviewers?.length > 0 && html`<span class="yours">Handled by ${pr.teammateReviewers.join(", ")}</span>`}
    </div>
    <div class="card-meta">
      <span class="author"
        >${safeUrl(pr.authorAvatar) && html`<img class="avatar" src=${safeUrl(pr.authorAvatar)} alt="" loading="lazy" />`}${pr.author || "unknown"}</span
      ><span class="repo">${pr.repo}#${pr.number}</span
      ><span>${relativeTime(pr.updatedAt || pr.createdAt)}</span
      >${pr.additions != null && html`<span class="diff-stat"><span class="add">+${pr.additions}</span> <span class="del">−${pr.deletions}</span></span>`}
    </div>
    ${
      editing
        ? html`<form
            class="note-editor"
            onSubmit=${(e) => {
              e.preventDefault();
              action("note", pr, draft);
              setEditing(false);
            }}
          >
            <textarea
              aria-label="PR note"
              value=${draft}
              onInput=${(e) => setDraft(e.target.value)}
              autofocus
            />
            <div>
              <button type="submit">Save note</button
              ><button type="button" onClick=${() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>`
        : note &&
          html`<div class="card-note">
            ${note}<${IconButton}
              label="Delete note"
              icon="×"
              onClick=${() => action("note", pr, "")}
            />
          </div>`
    }
  </article>`;
}
