import { useState, useRef, useEffect } from "preact/hooks";
import { html, safeUrl, relativeTime } from "./common.js";
import {
  latestNonCommentReviewsByReviewer,
  isApprovalSufficient,
} from "../domain/reviews.js";
import { session } from "../config.js";

function ReviewChips({ pr }) {
  const latest = latestNonCommentReviewsByReviewer(
    pr.reviews || [],
    pr.author,
    pr.pendingReviewerLogins,
  );
  const own = pr.author?.toLowerCase() === session.USERNAME?.toLowerCase();
  const userReviews = own
    ? []
    : (pr.reviews || [])
        .filter((r) => r.user === session.USERNAME)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const lastReview = userReviews[0];
  const changed =
    pr.section !== 4 &&
    lastReview?.commitId &&
    pr.headSha &&
    lastReview.commitId !== pr.headSha;
  const decision = userReviews.find(
    (r) => r.state === "APPROVED" || r.state === "CHANGES_REQUESTED",
  );
  const others = [...latest.values()].filter(
    (r) => r.user !== session.USERNAME,
  );
  const approvals = others.filter((r) => r.state === "APPROVED"),
    changes = others.filter((r) => r.state === "CHANGES_REQUESTED");
  const sufficient = isApprovalSufficient(
    pr,
    decision?.state === "APPROVED" || approvals.length > 0,
  );
  const indicators = [];
  const indicator = (className, label, detail = "") =>
    html`<span
      class=${className || undefined}
      tabIndex=${detail ? 0 : undefined}
      data-tooltip=${detail || undefined}
      aria-label=${detail || undefined}
      >${label}</span
    >`;
  if (pr.section === 5 && pr.teammateReviewers?.length) {
    const first = pr.teammateReviewers[0],
      extra =
        pr.teammateReviewers.length > 1
          ? ` +${pr.teammateReviewers.length - 1}`
          : "";
    indicators.push(
      indicator("yours", `✓ @${first}${extra}`, `Handled by @${first}${extra}`),
    );
  }
  if (pr.isDirect)
    indicators.push(
      indicator("yours", "requested you", "Review requested from you"),
    );
  else if (changed)
    indicators.push(indicator("changes", "↻ changed since review"));
  else if (decision?.state === "APPROVED")
    indicators.push(indicator("yours", "✓ you approved", "You approved"));
  else if (decision?.state === "CHANGES_REQUESTED")
    indicators.push(
      indicator("changes", "⚠ changes requested", "You requested changes"),
    );
  if (
    !own &&
    session.USERNAME &&
    ((pr.comments || []).some(
      (comment) =>
        comment.user?.toLowerCase() === session.USERNAME.toLowerCase(),
    ) ||
      (pr.reviews || []).some(
        (review) =>
          review.user?.toLowerCase() === session.USERNAME.toLowerCase() &&
          (review.state === "COMMENTED" || review.preview?.trim()),
      ))
  )
    indicators.push(indicator("yours", "you commented", "You commented"));
  if (pr.isDraft) indicators.push(indicator("", "DRAFT", "Draft PR"));
  if (approvals.length)
    indicators.push(
      indicator(
        "approved",
        `✓ ${approvals.length} approved`,
        `Approved by ${approvals.map((r) => `@${r.user}`).join(", ")}`,
      ),
    );
  if (changes.length)
    indicators.push(
      indicator(
        "changes",
        `⚠ ${changes.length} change request${changes.length === 1 ? "" : "s"}`,
        `Requested by ${changes.map((r) => `@${r.user}`).join(", ")}`,
      ),
    );
  if (pr.section === 4 && pr.pendingReviewers > 0 && !sufficient)
    indicators.push(
      indicator(
        "pending",
        `⧗ ${pr.pendingReviewers} pending`,
        `${pr.pendingReviewers} pending reviewer${pr.pendingReviewers === 1 ? "" : "s"}`,
      ),
    );
  return indicators.length || pr.ciFailing
    ? html`<span class="chips"
        >${indicators.length ? html`<span class="status-summary">${indicators}</span>` : null}${pr.ciFailing ? html`<span class="chip ci-fail">CI ✗</span>` : null}</span
      >`
    : null;
}

export function PRCard({ pr, state, action, badge }) {
  const note = state.notes[pr.id]?.text || "";
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(note);
  const input = useRef(),
    cancelled = useRef(false);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  const archived = !!state.archived[pr.id],
    deleted = !!state.archived[pr.id]?.deleted,
    pinned = state.promoted.includes(pr.id),
    stashed = !!state.stashed[pr.id];
  const classes = ["card"];
  if (badge) classes.push(`is-${badge.toLowerCase()}`);
  else if (pr.isDraft) classes.push("is-draft");
  if (
    !badge &&
    Date.now() - Date.parse(pr.updatedAt || pr.createdAt) > 30 * 86400000
  )
    classes.push("stale");
  if (archived) classes.push("archived");
  if (stashed) classes.push("archived-mine");
  if (pinned) classes.push("is-promoted");
  const button = (className, label, icon, callback, title = label) =>
    html`<button
      type="button"
      class=${className}
      title=${title}
      aria-label=${label}
      onClick=${callback}
    >
      ${icon}
    </button>`;
  return html`<article class=${classes.join(" ")} data-pr-id=${pr.id}>
    <div class="card-corner">
      ${badge && html`<span class=${`badge ${badge}`}>${badge.replace("-", " ")}</span>`}
      ${button(
        `card-action note-btn${note ? " has-note" : ""}`,
        "Edit note",
        "✎",
        () => {
          if (editing) {
            input.current?.focus();
            return;
          }
          cancelled.current = false;
          setDraft(note);
          setEditing(true);
        },
        "Add note",
      )}
      ${!deleted && !archived && button(`card-action promote${pinned ? " pinned" : ""}`, pinned ? "Unpin from High Priority" : "Pin to High Priority", "📌", () => action("pin", pr))}
      ${pr.section === 4 && !deleted && !archived && button(`card-action ${stashed ? "unstash" : "stash"}`, stashed ? "Move back to active list" : "Set aside for later", stashed ? "↺" : "🗄", () => action("stash", pr))}
      ${button(`card-action ${archived ? "unarchive" : "archive"}`, archived ? "Restore" : "Archive", archived ? "↺" : "×", () => action(archived ? "restore" : "archive", pr), deleted ? "Restore" : archived ? "Unarchive" : "Archive")}
      ${archived && !deleted && button("card-action archive", "Delete permanently from digest", "🗑", () => action("delete", pr), "Delete permanently")}
    </div>
    <a
      class="card-content-link"
      href=${safeUrl(pr.url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div class="card-heading">
        <div class="card-title">${pr.title}</div>
        <${ReviewChips} pr=${pr} />
      </div>
      <div class="card-meta">
        <span class="author"
          >${safeUrl(pr.authorAvatar) && html`<img class="avatar" src=${safeUrl(pr.authorAvatar)} alt="" loading="lazy" />`}${pr.author || "unknown"}</span
        ><span class="repo">${pr.repo}#${pr.number}</span
        ><span>${relativeTime(pr.updatedAt || pr.createdAt)}</span
        >${pr.additions != null && html`<span class="diff-stat"><span class="add">+${pr.additions}</span> <span class="del">−${pr.deletions}</span></span>`}
      </div>
    </a>
    ${
      editing
        ? html`<input
            ref=${input}
            type="text"
            class="card-note-editor"
            aria-label="PR note"
            placeholder="Add a note… (Enter to save, Esc to cancel)"
            value=${draft}
            onInput=${(e) => setDraft(e.target.value)}
            onBlur=${() => {
              if (!cancelled.current) action("note", pr, draft);
              setEditing(false);
            }}
            onKeyDown=${(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                cancelled.current = true;
                setEditing(false);
              }
            }}
          />`
        : note &&
          html`<div class="card-note" data-pr-id=${pr.id}>
            ${note}${button("note-delete", "Delete note", "×", () => action("note", pr, ""))}
          </div>`
    }
  </article>`;
}
