const REFRESH_INTERVAL_MS = 180000;

export function startRefreshScheduler(refresh, createWorker) {
  try {
    const worker = createWorker();
    worker.addEventListener("message", refresh);
    return () => worker.terminate();
  } catch {
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }
}
