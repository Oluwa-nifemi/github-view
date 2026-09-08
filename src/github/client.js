const etags = new Map();
let cacheToken;
let active = 0;
const queue = [];

export class RateLimitError extends Error {
  constructor(resetMs) {
    super(
      "GitHub rate limit reached. Try again after " +
        new Date(resetMs).toLocaleTimeString(),
    );
    this.resetMs = resetMs;
  }
}

export function apiURL(path) {
  const url = new URL(path, "https://api.github.com");
  if (url.origin !== "https://api.github.com" || url.username || url.password) {
    throw new Error("Only GitHub API URLs are allowed");
  }
  return url.href;
}

async function request(url, token, options = {}) {
  if (active >= 6) await new Promise((resolve) => queue.push(resolve));
  else active++;
  try {
    return await fetch(apiURL(url), {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });
  } finally {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
}

async function checkResponse(response) {
  if (response.ok) return;
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
  const retry = Number(response.headers.get("retry-after")) * 1000;
  if (
    response.status === 429 ||
    (response.status === 403 && (remaining === "0" || retry))
  ) {
    throw new RateLimitError(
      Math.max(reset || 0, Date.now() + (retry || 60000)),
    );
  }
  if (response.status === 403) {
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (
      response.headers.get("x-github-sso") ||
      /SAML|single sign.on/i.test(body.message || "")
    ) {
      throw new Error(
        "Organization SSO authorization is required. Authorize this token for your organization in GitHub settings, then refresh.",
      );
    }
  }
  // Do not include response bodies or credentials in diagnostics.
  throw new Error(
    `GitHub ${response.status} for ${new URL(response.url || "https://api.github.com").pathname}`,
  );
}

async function page(path, token) {
  if (cacheToken !== token) {
    etags.clear();
    cacheToken = token;
  }
  const url = apiURL(path);
  const cached = etags.get(url);
  const response = await request(url, token, {
    headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
  });
  if (response.status === 304 && cached) return cached;
  await checkResponse(response);
  const data = await response.json();
  const next = response.headers
    .get("link")
    ?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  const result = { data, next, etag: response.headers.get("etag") };
  if (result.etag && cacheToken === token) {
    if (etags.size > 1000) etags.delete(etags.keys().next().value);
    etags.set(url, result);
  }
  return result;
}

export async function ghJson(path, token, { paginate = true } = {}) {
  let current = await page(path, token);
  let data = current.data;
  const fields = ["items", "check_runs", "statuses", "users", "teams"].filter(
    (key) => Array.isArray(data?.[key]),
  );
  const seen = new Set([apiURL(path)]);
  while (paginate && current.next) {
    const next = apiURL(current.next);
    if (seen.has(next))
      throw new Error("GitHub returned a repeating pagination link");
    seen.add(next);
    current = await page(next, token);
    if (Array.isArray(data)) data = data.concat(current.data);
    else if (fields.length)
      data = {
        ...data,
        ...Object.fromEntries(
          fields.map((field) => [
            field,
            data[field].concat(current.data[field] || []),
          ]),
        ),
      };
    else throw new Error("Unexpected paginated GitHub response");
  }
  return data;
}

export async function ghGraphQL(query, token) {
  const response = await request("/graphql", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  await checkResponse(response);
  const json = await response.json();
  if (json.errors?.length) {
    if (json.errors.some((error) => error.type === "RATE_LIMITED"))
      throw new RateLimitError(Date.now() + 60000);
    throw new Error(`GitHub GraphQL: ${json.errors[0].message}`);
  }
  return json.data;
}
