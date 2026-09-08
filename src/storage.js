export function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value === null || typeof value !== typeof fallback) return fallback;
    if (Array.isArray(value) !== Array.isArray(fallback)) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
