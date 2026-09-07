import { h } from "preact";
import htm from "htm";
import {
  RefreshCw,
  Settings,
  Pin,
  Archive,
  ArchiveRestore,
  Trash2,
  NotebookPen,
  X,
  Check,
  Mail,
  Inbox,
} from "lucide-preact";
export const html = htm.bind(h);
export const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};
export function relativeTime(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (!Number.isFinite(minutes)) return "";
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.round(minutes / 60)}h ago`
        : `${Math.round(minutes / 1440)}d ago`;
}
export function IconButton({ label, icon, onClick, active, disabled }) {
  const Component =
    {
      "↻": RefreshCw,
      "⚙": Settings,
      "⌖": Pin,
      "×": X,
      "↶": ArchiveRestore,
      "▣": Inbox,
      "⌫": Trash2,
      "✎": NotebookPen,
      "✓": Check,
      "○": Mail,
    }[icon] || Archive;
  return html`<button
    type="button"
    class=${`icon-button ${active ? "active" : ""}`}
    title=${label}
    aria-label=${label}
    onClick=${onClick}
    disabled=${disabled}
  >
    <${Component} size=${16} strokeWidth=${1.7} />
  </button>`;
}
