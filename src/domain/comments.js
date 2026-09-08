import { snippet } from "./text.js";

export function normalizeComments(issueComments, reviewComments) {
  const authors = new Map(
    reviewComments.map((comment) => [comment.id, comment.user?.login]),
  );
  const normalize = (comment, review) => ({
    id: comment.id,
    user: comment.user?.login,
    createdAt: comment.created_at,
    url: comment.html_url,
    path: comment.path || null,
    line: comment.line ?? comment.original_line ?? null,
    preview: snippet(comment.body, 160),
    replyToUser:
      review && comment.in_reply_to_id
        ? authors.get(comment.in_reply_to_id) || null
        : null,
  });
  return [
    ...issueComments.map((comment) => normalize(comment, false)),
    ...reviewComments.map((comment) => normalize(comment, true)),
  ];
}
