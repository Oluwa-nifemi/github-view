# Local Startup

Use Node.js 22.12 or newer. From the project folder:

```sh
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:4173>. The server only accepts connections from your own computer. Stop it with Ctrl+C. During development, use `npm run dev` for automatic reloads.

## Start Automatically On macOS

Run this once from the project folder:

```sh
node scripts/startup.mjs install
```

The installer installs locked dependencies, builds the app, and registers a user LaunchAgent that starts immediately and at every login. No Docker or administrator account is needed. It serves the app in the background; bookmark the URL to open it. It does not open a browser automatically. Stop a manually started server first so port 4173 is available.

The installer copies the built app and server to `~/Library/Application Support/GitHub View/`, so the background service does not depend on access to the Documents folder. It stores the current Node executable's absolute path. Run the installer again after code updates or changing Node installations. `npm run build` alone updates the checkout build; `npm run startup:install` installs that build for the login service.

```sh
node scripts/startup.mjs status
node scripts/startup.mjs uninstall
```

Logs are in `~/Library/Logs/GitHub View/`. The LaunchAgent is `~/Library/LaunchAgents/com.github-view.local.plist`. Uninstall stops the background server and removes that LaunchAgent; installed static assets remain in Application Support. Browser settings are unchanged.

The startup scripts do not read or save GitHub credentials. Authenticate through the app. Browser storage belongs to an origin, so opening the old HTML file or the development server uses separate storage from this production URL.
