import { config, session } from "../config.js";
export function collectNotificationEvents(
  oldSnap,
  newSnap,
  username = session.USERNAME,
) {
  if (!oldSnap) return [];
  const items = [];
  const existingKeys = new Set(items.map((n) => n.key));
  const oldPRs = oldSnap.prs || {};

  for (const [prId, pr] of Object.entries(newSnap.prs)) {
    const old = oldPRs[prId];

    // Section 4: reviews on your PRs
    if (pr.section === 4) {
      const oldReviewKeys = new Set(
        (old?.reviews || []).map((r) => `${r.user}:${r.submittedAt}`),
      );
      for (const review of pr.reviews || []) {
        if (review.user === pr.author) continue;
        const isBot =
          review.user &&
          (review.user === config.AGENT_BOT_LOGIN ||
            review.user.endsWith("[bot]"));
        if (review.state === "COMMENTED" && !isBot) continue;
        const rKey = `${review.user}:${review.submittedAt}`;
        if (oldReviewKeys.has(rKey)) continue;
        let type;
        if (review.state === "APPROVED") type = "review_approved";
        else if (review.state === "CHANGES_REQUESTED")
          type = "review_changes_requested";
        else type = "new_review";
        const key = `${type}:${prId}:${review.user}:${review.submittedAt}`;
        if (existingKeys.has(key)) continue;
        items.unshift({
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          key,
          type,
          actor: review.user,
          isBot,
          onMyPR: true,
          prId,
          prTitle: pr.title,
          prUrl: pr.url,
          preview: review.preview || "",
          prAuthor: pr.author,
          createdAt: review.submittedAt || new Date().toISOString(),
          readAt: null,
        });
        existingKeys.add(key);
      }

      // Comments on your PRs (includes bots for the feed)
      const oldCommentKeys = new Set(
        (old?.comments || []).map((c) => `${c.user}:${c.createdAt}`),
      );
      for (const comment of pr.comments || []) {
        if (comment.user === pr.author) continue;
        if (comment.user === username) continue;
        const cKey = `${comment.user}:${comment.createdAt}`;
        if (oldCommentKeys.has(cKey)) continue;
        const isBot =
          comment.user &&
          (comment.user === config.AGENT_BOT_LOGIN ||
            comment.user.endsWith("[bot]"));
        const type =
          comment.replyToUser === username
            ? "reply_to_my_comment"
            : "comment_on_my_pr";
        const key = `${type}:${prId}:${comment.user}:${comment.createdAt}`;
        if (existingKeys.has(key)) continue;
        items.unshift({
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          key,
          type,
          actor: comment.user,
          isBot,
          onMyPR: true,
          prId,
          prTitle: pr.title,
          prUrl: pr.url,
          preview: comment.preview || "",
          prAuthor: pr.author,
          commentUrl: comment.url || null,
          path: comment.path || null,
          line: comment.line || null,
          createdAt: comment.createdAt || new Date().toISOString(),
          readAt: null,
        });
        existingKeys.add(key);
      }
    }

    // Section 3: new comments on review-requested PRs
    if ([1, 2, 3].includes(pr.section) && old) {
      const oldCommentKeys = new Set(
        (old.comments || []).map((c) => `${c.user}:${c.createdAt}`),
      );
      for (const comment of pr.comments || []) {
        if (comment.user === username) continue;
        // Skip bot comments on other people's PRs — only useful on your own
        if (
          comment.user &&
          (comment.user === config.AGENT_BOT_LOGIN ||
            comment.user.endsWith("[bot]"))
        )
          continue;
        const cKey = `${comment.user}:${comment.createdAt}`;
        if (oldCommentKeys.has(cKey)) continue;
        const isBot =
          comment.user &&
          (comment.user === config.AGENT_BOT_LOGIN ||
            comment.user.endsWith("[bot]"));
        const type =
          comment.replyToUser === username
            ? "reply_to_my_comment"
            : "comment_on_watched_pr";
        const key = `${type}:${prId}:${comment.user}:${comment.createdAt}`;
        if (existingKeys.has(key)) continue;
        items.unshift({
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          key,
          type,
          actor: comment.user,
          isBot,
          onMyPR: false,
          prId,
          prTitle: pr.title,
          prUrl: pr.url,
          preview: comment.preview || "",
          prAuthor: pr.author,
          commentUrl: comment.url || null,
          path: comment.path || null,
          line: comment.line || null,
          createdAt: comment.createdAt || new Date().toISOString(),
          readAt: null,
        });
        existingKeys.add(key);
      }
    }

    // Direct review requests are NOT added to the notification feed —
    // they already appear prominently in the PRs tab.
  }

  // Extra notifications: @mentions, state changes, assignments, team mentions
  const oldExtraIds = new Set(
    (oldSnap.mentions || []).map((m) => `${m.id}:${m.updatedAt}`),
  );
  for (const mention of newSnap.mentions || []) {
    if (oldExtraIds.has(`${mention.id}:${mention.updatedAt}`)) continue;

    // Map GitHub reason to our event type
    let type;
    switch (mention.reason) {
      case "mention":
      case "comment":
        type = "mentioned";
        break;
      case "state_change":
        type = "pr_closed";
        break;
      case "assign":
        type = "assigned";
        break;
      case "team_mention":
        type = "team_mentioned";
        break;
      default:
        continue;
    }

    // For mention/comment/team_mention, skip PRs already tracked by the snapshot
    // (they get their own events from the diff). For state_change and assign,
    // always show — even if the PR was tracked, the state change is new info.
    if (
      ["mentioned", "team_mentioned"].includes(type) &&
      newSnap.prs[mention.prId]
    )
      continue;

    const key = `${type}:${mention.prId}:${mention.id}:${mention.updatedAt}`;
    if (existingKeys.has(key)) continue;
    items.unshift({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key,
      type,
      actor: mention.actor || null,
      isBot: false,
      prId: mention.prId,
      prTitle: mention.title,
      prUrl: mention.url,
      createdAt: mention.updatedAt || new Date().toISOString(),
      readAt: null,
      prAuthor: newSnap.prs[mention.prId]?.author || null,
    });
    existingKeys.add(key);
  }

  return items;
}

export function repairNotificationActors(items, mentions) {
  const actors = new Map(
    mentions
      .filter((mention) => mention.actor)
      .map((mention) => [
        `${mention.prId}:${mention.id}:${mention.updatedAt}`,
        mention.actor,
      ]),
  );
  return items.map((item) => {
    if (item.actor) return item;
    const match = item.key?.match(
      /^(?:mentioned|assigned|pr_closed|team_mentioned):(.+):([^:]+):(.*)$/,
    );
    if (!match) return item;
    const actor = actors.get(`${match[1]}:${match[2]}:${match[3]}`);
    return actor ? { ...item, actor } : item;
  });
}
