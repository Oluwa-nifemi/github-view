import { allRequests } from "../github/concurrent.js";

export async function retainOpenSavedPRs(
  prs,
  previousPRs,
  archived,
  stashed,
  loadPR,
) {
  const retained = retainSavedPRs(prs, previousPRs, archived, stashed);
  await allRequests(
    Object.keys(stashed).map(async (id) => {
      if (prs[id] || archived[id] || !retained[id]) return;
      const detail = await loadPR(id);
      if (detail.state !== "open" || detail.merged) delete retained[id];
    }),
  );
  return retained;
}

export function retainSavedPRs(prs, previousPRs, archived, stashed) {
  const retained = {};
  for (const entries of [archived, stashed]) {
    for (const [id, entry] of Object.entries(entries)) {
      const pr = previousPRs?.[id] || entry.pr;
      if (pr?.id === id) retained[id] = pr;
    }
  }
  return { ...retained, ...prs };
}
