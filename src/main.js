import { render } from "preact";
import { html } from "./ui/common.js";
import { App } from "./ui/App.js";
import "./styles/base.css";
import "./styles/cards.css";
import "./styles/app.css";
render(html`<${App} />`, document.getElementById("app"));
