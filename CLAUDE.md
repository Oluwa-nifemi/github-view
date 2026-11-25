# GitHub View

Local GitHub PR triage dashboard. Preact + htm components, Vite build, Node static server.
Read `github-digest.map.md` to locate the owning module before editing.

## Working Here

- Use the module map and `rg` to locate code, then read targeted ranges. Do not load large files wholesale.
- Update `github-digest.map.md` after structural changes so module ownership and data contracts stay accurate.
- `npm ci`, then `npm run dev`. Production: `npm run build && npm start`.
- After every code change, do this without being asked: run `npm test` and `npm run startup:install` with escalation (`require_escalated`). Tests open a local port. `startup:install` rebuilds and restarts the LaunchAgent. Then tell the user to reload the browser.
- Keep feature changes inside their owning modules. Do not rebuild a large shared controller or add a second UI framework.
- UI components live in `src/ui`; API access in `src/github`; PR enrichment in `src/snapshot`; review/activity rules in `src/domain`.
- `buildSnapshot` returns a complete snapshot. Failed required requests reject the refresh so the last good snapshot stays visible. Do not silently turn failed requests into empty lists or successful CI results.
- All GitHub HTTP uses `ghJson` or `ghGraphQL`. Keep pagination, rate limits, and token isolation in the API layer.
- Preserve `gh_*` storage keys. Increase snapshot version when enrichment contracts change. Browser storage imports must exclude credentials.
- Settings are mutable `config`; active identity and roster live in `session`. Refreshes must not overlap, including account/config changes.
- Use Preact escaping and `safeUrl` for external links. No raw GitHub content in HTML strings. Keep action buttons outside links.
- Preserve the original dashboard appearance, icons, copy, and interactions. This is a modular refactor, not a redesign. Keep accessible labels and mobile layout.
- GitHub CLI calls must use the elevated boundary for macOS Keychain access. Never print or persist tokens in files, traces, screenshots, or fixtures.

## Validation

- `npm test`: domain, API, watcher and static-server checks.
- `npm run test:e2e`: synthetic GitHub responses through the real UI and snapshot builder.
- `npm run build`: production build.
- `npm run test:live`: isolated browser with the existing `gh` credential. Organizations with SAML SSO require SSO authorization; do not add scopes to work around SSO.
- Format changed files with `npm run format` and inspect browser screenshots after UI changes.

`AGENTS.md` is a symlink to this file. Keep the map and README current when changing module ownership or startup.
