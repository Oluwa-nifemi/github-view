import { useState } from "preact/hooks";
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const strings = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
export function normalize(key, value, fallback) {
  if (key === "gh_digest_notifications")
    return Array.isArray(value)
      ? value.filter(
          (item) =>
            object(item) &&
            ["id", "key", "prId", "type", "createdAt"].every(
              (field) => typeof item[field] === "string",
            ) &&
            [
              "preview",
              "actor",
              "prAuthor",
              "prTitle",
              "path",
              "commentUrl",
              "prUrl",
            ].every(
              (field) => item[field] == null || typeof item[field] === "string",
            ) &&
            !(item.type === "new_review" && !item.preview?.trim()),
        )
      : [];
  if (key === "gh_digest_last_snapshot") {
    if (!object(value) || !object(value.prs)) return fallback;
    const prs = Object.fromEntries(
      Object.entries(value.prs)
        .filter(
          ([, pr]) =>
            object(pr) &&
            typeof pr.id === "string" &&
            typeof pr.repo === "string" &&
            typeof pr.title === "string" &&
            (pr.author == null || typeof pr.author === "string"),
        )
        .map(([id, pr]) => [
          id,
          {
            ...pr,
            reviews: Array.isArray(pr.reviews) ? pr.reviews.filter(object) : [],
            comments: Array.isArray(pr.comments)
              ? pr.comments.filter(object)
              : [],
            pendingReviewerLogins: strings(pr.pendingReviewerLogins),
            teammateReviewers: strings(pr.teammateReviewers),
          },
        ]),
    );
    return { ...value, prs };
  }
  if (key === "gh_digest_ignored_ci")
    return Array.isArray(value)
      ? value.filter(
          (rule) =>
            object(rule) &&
            typeof rule.repo === "string" &&
            typeof rule.pattern === "string",
        )
      : fallback;
  if (Array.isArray(fallback)) return strings(value);
  if (object(fallback)) {
    if (!object(value)) return fallback;
    if (key === "gh_digest_collapsed_sections") {
      const legacy = {
        priority: "section-3",
        others: "section-3b",
        mine: "section-4",
        handled: "section-team-handled",
        engaged: "section-engaged",
        teammates: "section-teammates-open",
        archived: "section-archive",
        deleted: "section-deleted",
      };
      return Object.fromEntries(
        Object.entries(legacy).map(([name, old]) => [
          name,
          typeof value[name] === "boolean"
            ? value[name]
            : typeof value[old] === "boolean"
              ? value[old]
              : [
                  "mine",
                  "engaged",
                  "teammates",
                  "archived",
                  "deleted",
                ].includes(name),
        ]),
      );
    }
    if (["gh_digest_archived", "gh_digest_archived_mine"].includes(key))
      return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => object(entry)),
      );
    if (key === "gh_digest_notes")
      return Object.fromEntries(
        Object.entries(value).filter(
          ([, entry]) => object(entry) && typeof entry.text === "string",
        ),
      );
    return value;
  }
  return typeof value === typeof fallback ? value : fallback;
}
export function read(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    const value = JSON.parse(stored);
    const result = normalize(key, value === null ? fallback : value, fallback);
    if (key === "gh_digest_notifications" && stored !== JSON.stringify(result))
      write(key, result);
    return result;
  } catch {
    return fallback;
  }
}
export function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  const update = (next) =>
    setValue((previous) => {
      const result = normalize(
        key,
        typeof next === "function" ? next(previous) : next,
        fallback,
      );
      write(key, result);
      return result;
    });
  return [value, update];
}
export const toggle = (items, item) =>
  items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
export function retainNotifications(items) {
  const now = Date.now(),
    keys = new Set();
  return items
    .filter((item) => item && typeof item.key === "string")
    .map((item) =>
      item.isBot && !item.readAt && now - Date.parse(item.createdAt) > 86400000
        ? { ...item, readAt: now }
        : item,
    )
    .filter((item) => {
      if (
        keys.has(item.key) ||
        (!item.pinnedAt && item.readAt && now - item.readAt > 172800000)
      )
        return false;
      keys.add(item.key);
      return true;
    });
}
