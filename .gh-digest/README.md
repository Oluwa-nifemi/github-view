# GitHub Digest watcher

`watch.mjs` alerts through `terminal-notifier` for direct review requests, direct
mentions, assignments, replies to your comments, and requested changes on your PRs.

It uses the active `gh` CLI account. Authenticate it before running:

```sh
gh auth login -h github.com
```

The watcher uses `GH_TOKEN` or `GITHUB_TOKEN` when supplied, otherwise `gh auth token`.
The sample LaunchAgent clears those overrides and uses the CLI account. No token
is stored in this repository or its LaunchAgent definition.

Run one check:

```sh
node .gh-digest/watch.mjs
```

The sample LaunchAgent runs this check every fifteen minutes. Copy
`com.github-view.watcher.plist.example` to `~/Library/LaunchAgents/com.github-view.watcher.plist`
and replace the placeholder paths (`/path/to/node`, `/path/to/github-view`, `/Users/you`)
to match your machine. Optionally set `GH_DIGEST_ORG` in `EnvironmentVariables` to
limit queries to one GitHub organization. It is separate from the dashboard login service.

The watcher stores its deduplication state in `.gh-digest/state.json`. Git ignores
that file.
