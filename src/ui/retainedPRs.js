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
