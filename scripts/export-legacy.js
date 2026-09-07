// Classic script so the migration page still works when opened via file://.
document.getElementById("export").addEventListener("click", () => {
  const keys = [
    "gh_digest_user_config",
    "gh_digest_ignored_ci",
    "gh_digest_filter_authors",
    "gh_digest_filter_repos",
    "gh_digest_archived",
    "gh_digest_archived_mine",
    "gh_digest_notes",
    "gh_digest_promoted",
    "gh_digest_collapsed_authors",
    "gh_digest_collapsed_sections",
    "gh_digest_notification_prefs",
  ];
  const settings = {};
  if (document.getElementById("include-content").checked) {
    keys.push("gh_digest_last_snapshot", "gh_digest_notifications");
  }
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) settings[key] = JSON.parse(raw);
    } catch {
      /* Recover intact preferences even when another value is damaged. */
    }
  }
  for (const key of [
    "gh_digest_active_view",
    "gh_digest_notif_filter",
    "gh_digest_teammates",
  ]) {
    const value = localStorage.getItem(key);
    if (value !== null) settings[key] = value;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 1, settings }, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "github-digest-settings.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById("status").textContent =
    "Settings exported. Connect GitHub in the new dashboard, then import this file in Settings.";
});
