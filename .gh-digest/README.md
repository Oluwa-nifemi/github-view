# GitHub Digest watcher

`watch.mjs` alerts through `terminal-notifier` for direct review requests, direct
mentions, assignments, replies to your comments, and requested changes on your PRs.

It uses the active `gh` CLI account. Authenticate it before running:

```sh
gh auth login -h github.com
```

The installed watcher uses the `github-digest-watcher` macOS Keychain item. It
does not store the token in this repository or its LaunchAgent definition.

Run one check:

```sh
node .gh-digest/watch.mjs
```

The installed LaunchAgent runs this check every five minutes. Its source
definition is `com.oluwanifemi.github-digest.plist`.

The watcher stores its deduplication state in `.gh-digest/state.json`. Git ignores
that file.
