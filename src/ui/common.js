import { h } from "preact";
import htm from "htm";
export { relativeTime } from "../domain/text.js";
export const html = htm.bind(h);
export const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};
