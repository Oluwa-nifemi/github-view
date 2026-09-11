import { render } from "preact";
import { html } from "./ui/common.js";
import { App } from "./ui/App.js";
import "./styles/base.css";
import "./styles/cards.css";
import "./styles/app.css";
import "./styles/notifications.css";
import "./styles/integration.css";

const buildId = document.body.dataset.buildId;
if (buildId && !buildId.startsWith("__")) {
  setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/", { cache: "no-store" });
      const html = await response.text();
      const nextBuildId = html.match(/data-build-id="([^"]+)"/)?.[1];
      if (nextBuildId && nextBuildId !== buildId) location.reload();
    } catch {
      /* The next check retries after transient local-server failures. */
    }
  }, 30000);
}

render(html`<${App} />`, document.getElementById("root"));
