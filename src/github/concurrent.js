// Wait for all work before rejecting so a failed refresh cannot overlap the next one.
export async function allRequests(promises) {
  const results = await Promise.allSettled(promises);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map((result) => result.value);
}
