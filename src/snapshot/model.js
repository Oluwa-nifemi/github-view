import { session } from "../config.js";
export function applyCachedPR(cached, title) {
  return {
    ...cached,
    title,
    authorIsTeammate: !!(cached.author && session.teammates.has(cached.author)),
  };
}

// Construct the base PR object fields shared by every section.
// Pass null for item when only prDetail is available (section 5),
// or null for prDetail when no per-PR API call was made (section 7).
export function buildPRBase(prId, repo, section, item, prDetail) {
  const src = prDetail ?? item;
  return {
    id: prId,
    number: item?.number ?? prDetail.number,
    repo,
    title: item?.title ?? prDetail.title,
    author: src.user?.login || null,
    authorAvatar: src.user?.avatar_url || null,
    authorIsTeammate: !!(
      src.user?.login && session.teammates.has(src.user.login)
    ),
    url: src.html_url,
    createdAt: src.created_at,
    updatedAt: prDetail?.updated_at ?? item.updated_at,
    section,
    isDraft: !!(prDetail?.draft ?? item.draft),
    additions: prDetail?.additions ?? null,
    deletions: prDetail?.deletions ?? null,
  };
}
