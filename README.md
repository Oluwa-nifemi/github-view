# GitHub View

A local GitHub PR dashboard built with Preact, preserving the original dashboard UI. Review requests, your PRs, team activity, notes, and notification triage stay in one place.

## Start

Requires Node 22.12+ and npm.

```sh
npm ci
npm run build
npm start
```

Open [GitHub Digest](http://127.0.0.1:4173). The server only listens on your machine. Paste a GitHub token with repository, organization read, and notification access. For Ardoq, authorize the token for organization SSO.

To keep the server running automatically whenever you log into this Mac:

```sh
npm run startup:install
```

The installer installs dependencies, builds the app, and registers a macOS login service. No Docker or terminal window is needed afterward. It starts the server, not browser windows or desktop notifications. [Startup details and removal](docs/startup.md).

## Develop

```sh
npm run dev
```

Vite prints the development URL and reloads changes automatically. After changing the installed app, run `npm run startup:install` to rebuild and update its Application Support copy. For a manually started server, `npm run build` is enough.

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run test:live
```

Unit tests cover domain rules, API behavior, and the optional watcher. Browser tests exercise synthetic PRs through the real UI and API processing. The live test reads `gh auth token` into an isolated browser, uses no credential files or tracing, and destroys the browser afterward. It needs an existing GitHub CLI login with organization SSO authorization. The CLI cannot create a PAT without an interactive GitHub authorization flow.

## Existing Browser Data

`file://` and `http://127.0.0.1:4173` have separate browser storage. Open the updated `github-digest.html` at its original location in the same browser to export notes/preferences. Select the optional history checkbox to include cached PRs and notification read/pin state. Connect GitHub in the new dashboard, then use Settings → Import settings. Tokens are never included. If your old HTML lives elsewhere, back it up, then replace it at the same path with this migration page and place `scripts/export-legacy.js` beside it in a `scripts` folder. Keep the same browser profile so the page can read its original storage.

Keep using the same hostname and port to retain browser state. `localhost` and `127.0.0.1` also have separate storage.

## Code Map

See [the module map](github-digest.map.md) for ownership and data contracts, and [the audit](docs/audit.md) for the issues found before migration. UI components, API transport, snapshot enrichment, domain rules, and startup scripts are separate. Shipped JavaScript is roughly 25 KB gzipped.

The optional `.gh-digest/watch.mjs` is a separate one-shot desktop-notification tool. It uses existing CLI authentication and is not enabled by the login service.
