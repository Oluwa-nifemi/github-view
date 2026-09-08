import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.github-view.local";
const destination = resolve(
  homedir(),
  "Library/LaunchAgents",
  `${label}.plist`,
);
const runtime = resolve(homedir(), "Library/Application Support/GitHub View");
const domain = `gui/${process.getuid?.()}`;
const target = `${domain}/${label}`;
const command = process.argv[2];
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

function run(
  program,
  args,
  { optional = false, quiet = false, env = process.env } = {},
) {
  const result = spawnSync(program, args, {
    cwd: root,
    stdio: quiet ? "ignore" : "inherit",
    env,
  });
  if (!optional && (result.error || result.status !== 0)) {
    throw new Error(
      `${program} ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : ""}`,
    );
  }
  return result;
}

try {
  if (!["install", "uninstall", "status"].includes(command))
    throw new Error("Usage: node scripts/startup.mjs install|uninstall|status");
  if (process.platform !== "darwin")
    throw new Error("Login startup supports macOS. Elsewhere, run npm start.");
  if (command === "status") {
    const result = run("launchctl", ["print", target], { optional: true });
    process.exitCode = result.status || 0;
  } else if (command === "uninstall") {
    run("launchctl", ["bootout", target], { optional: true });
    await rm(destination, { force: true });
    console.log(
      "Removed GitHub View login startup. App data in your browser is unchanged.",
    );
  } else {
    const env = {
      ...process.env,
      PATH: `${dirname(process.execPath)}:${process.env.PATH || ""}`,
    };
    // Build before touching an existing working service.
    run("npm", ["ci"], { env });
    run("npm", ["run", "build"], { env });
    await readFile(resolve(root, "dist/index.html"));
    // Install runtime assets outside macOS's protected Documents directory.
    await mkdir(resolve(runtime, "scripts"), { recursive: true });
    await cp(resolve(root, "dist"), resolve(runtime, "dist"), {
      recursive: true,
    });
    await cp(
      resolve(root, "scripts/serve.mjs"),
      resolve(runtime, "scripts/serve.mjs"),
    );
    const logs = resolve(homedir(), "Library/Logs/GitHub View");
    await mkdir(dirname(destination), { recursive: true });
    await mkdir(logs, { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(resolve(runtime, "scripts/serve.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(runtime)}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(resolve(logs, "server.log"))}</string>
<key>StandardErrorPath</key><string>${xml(resolve(logs, "server.error.log"))}</string>
</dict></plist>\n`;
    await writeFile(destination, plist, { mode: 0o600 });
    run("launchctl", ["bootout", target], { optional: true, quiet: true });
    // bootout can return before launchd has released the old job registration.
    let registered = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = run("launchctl", ["bootstrap", domain, destination], {
        optional: true,
        quiet: true,
      });
      if (result.status === 0) {
        registered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!registered)
      throw new Error(
        "Could not register the login service. Run startup:status for details.",
      );
    let healthy = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const response = await fetch("http://127.0.0.1:4173", {
          signal: AbortSignal.timeout(1000),
        });
        healthy =
          response.ok && (await response.text()).includes("GitHub Digest");
        if (healthy) break;
      } catch {
        /* launchd can take a moment to start the process. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!healthy)
      throw new Error(`Login service did not become reachable. Check ${logs}`);
    console.log("GitHub View now starts at login: http://127.0.0.1:4173");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
