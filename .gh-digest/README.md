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

The sample LaunchAgent runs this check every fifteen minutes. Its source
definition is `com.oluwanifemi.github-digest.plist`; its absolute paths must match
the Mac where it is installed. It is separate from the dashboard login service.

The watcher stores its deduplication state in `.gh-digest/state.json`. Git ignores
that file.
