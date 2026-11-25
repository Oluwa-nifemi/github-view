import { useEffect, useRef, useState } from "preact/hooks";
import {
  read,
  write,
  useStored,
  toggle,
  retainNotifications,
} from "./state.js";
import { buildSnapshot } from "../snapshot/build.js";
import { ghJson } from "../github/client.js";
import { config, session } from "../config.js";
import { diff } from "../domain/activity.js";
import { startRefreshScheduler } from "./refreshScheduler.js";
import { retainOpenSavedPRs, retainSavedPRs } from "./retainedPRs.js";
import {
  collectNotificationEvents,
  repairNotificationActors,
} from "../notifications/events.js";
export function useDashboard() {
  session.USERNAME ||= localStorage.getItem("gh_username") || "";
  const [token, setToken] = useState(
    () => localStorage.getItem("gh_token") || "",
  );
  const [snapshot, setSnapshot] = useState(() => {
    const cached = read("gh_digest_last_snapshot", {});
    return cached.prs && typeof cached.prs === "object" ? cached : null;
  });
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const [busy, setBusy] = useState(false),
    [previousTimestamp, setPreviousTimestamp] = useState(null),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [badges, setBadges] = useState({});
  const [view, setView] = useState(
    () => localStorage.getItem("gh_digest_active_view") || "prs",
  );
  const [notifFilter, setNotifFilter] = useState(
    () => localStorage.getItem("gh_digest_notif_filter") || "unread",
  );
  const [archived, setArchived] = useStored("gh_digest_archived", {}),
    [stashed, setStashed] = useStored("gh_digest_archived_mine", {}),
    [notes, setNotes] = useStored("gh_digest_notes", {});
  const [promoted, setPromoted] = useStored("gh_digest_promoted", []),
    [authors, setAuthors] = useStored("gh_digest_filter_authors", []),
    [repos, setRepos] = useStored("gh_digest_filter_repos", []);
  const [sections, setSections] = useStored("gh_digest_collapsed_sections", {}),
    [collapsedAuthors, setCollapsedAuthors] = useStored(
      "gh_digest_collapsed_authors",
      [],
    );
  const [notifications, setNotifications] = useStored(
      "gh_digest_notifications",
      [],
    ),
    [prefs, setPrefs] = useStored("gh_digest_notification_prefs", {});
  const [teamOnly, setTeamOnlyState] = useState(
    () => localStorage.getItem("gh_digest_teammates") === "1",
  );
  const current = useRef({ token, snapshot, archived, stashed }),
    inflight = useRef(null),
    epoch = useRef(0),
    rateUntil = useRef(0);
  current.current = { token, snapshot, archived, stashed };
  function clearAccount(nextUsername) {
    setPreviewSnapshot(null);
    const oldUsername = localStorage.getItem("gh_username");
    if (oldUsername)
      write(`gh_digest_account_${oldUsername}`, {
        archived,
        stashed,
        notes,
        promoted,
        authors,
        repos,
        sections,
        collapsedAuthors,
        prefs,
      });
    const saved = nextUsername
      ? read(`gh_digest_account_${nextUsername}`, {})
      : {};
    setSnapshot(null);
    setBadges({});
    setNotifications([]);
    setArchived(saved.archived || {});
    setStashed(saved.stashed || {});
    setNotes(saved.notes || {});
    setPromoted(saved.promoted || []);
    setAuthors(saved.authors || []);
    setRepos(saved.repos || []);
    setSections(saved.sections || {});
    setCollapsedAuthors(saved.collapsedAuthors || []);
    setPrefs(saved.prefs || {});
    localStorage.removeItem("gh_digest_last_snapshot");
    localStorage.removeItem("gh_digest_team_members");
    session.teammates = new Set();
  }
  async function connect(value, initialScope) {
    setBusy(true);
    setError("");
    const generation = ++epoch.current;
    try {
      if (inflight.current) await inflight.current.promise;
      if (generation !== epoch.current) return;
      const user = await ghJson("/user", value);
      if (generation !== epoch.current) return;
      if (!user?.login) throw new Error("GitHub did not return an account.");
      if (initialScope) {
        const nextOrg =
          typeof initialScope.org === "string"
            ? initialScope.org.trim()
            : config.ORG;
        const nextTeams = Array.isArray(initialScope.teams)
          ? initialScope.teams.map((t) => t.trim()).filter(Boolean)
          : config.TEAMS;
        if (
          nextOrg !== config.ORG ||
          JSON.stringify(nextTeams) !== JSON.stringify(config.TEAMS)
        ) {
          config.ORG = nextOrg;
          config.TEAMS = nextTeams;
          const savedConfig = read("gh_digest_user_config", {});
          write("gh_digest_user_config", {
            ...savedConfig,
            org: nextOrg,
            teams: nextTeams,
          });
          localStorage.removeItem("gh_digest_team_members");
        }
      }
      if (value !== current.current.token) rateUntil.current = 0;
      if (localStorage.getItem("gh_username") !== user.login)
        clearAccount(user.login);
      session.USERNAME = user.login;
      localStorage.setItem("gh_username", user.login);
      localStorage.setItem("gh_token", value);
      setToken(value);
    } catch (error) {
      if (generation === epoch.current) setError(error.message);
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  function disconnect() {
    setPreviewSnapshot(null);
    epoch.current++;
    localStorage.removeItem("gh_token");
    setToken("");
    current.current.token = "";
    setSnapshot(null);
    setNotifications([]);
    localStorage.removeItem("gh_digest_last_snapshot");
    setSettings(false);
    setBusy(false);
  }
  async function refresh() {
    if (inflight.current) {
      if (inflight.current.generation === epoch.current)
        return inflight.current.promise;
      await inflight.current.promise;
      return refresh();
    }
    if (Date.now() < rateUntil.current) return;
    const active = current.current;
    if (!active.token) return;
    const generation = epoch.current;
    setBusy(true);
    setError("");
    const promise = (async () => {
      try {
        const user = await ghJson("/user", active.token);
        if (generation !== epoch.current) return;
        const sameAccount = localStorage.getItem("gh_username") === user.login;
        if (!sameAccount) clearAccount(user.login);
        session.USERNAME = user.login;
        localStorage.setItem("gh_username", user.login);
        const previous = sameAccount ? active.snapshot : null;
        const fresh = await buildSnapshot(active.token, previous, (preview) => {
          if (generation === epoch.current && !previous)
            setPreviewSnapshot(preview);
        });
        if (sameAccount)
          fresh.prs = await retainOpenSavedPRs(
            fresh.prs,
            previous?.prs,
            current.current.archived,
            current.current.stashed,
            (id) => {
              const [repo, number] = id.split("#");
              return ghJson(`/repos/${repo}/pulls/${number}`, active.token);
            },
          );
        if (generation !== epoch.current) return;
        setPreviousTimestamp(previous?.timestamp || null);
        const events =
          collectNotificationEvents(previous, fresh, session.USERNAME) || [];
        setNotifications((items) =>
          retainNotifications([
            ...events,
            ...repairNotificationActors(items, fresh.mentions || []),
          ]),
        );
        setBadges(previous ? diff(previous, fresh) : {});
        setArchived((entries) =>
          Object.fromEntries(
            Object.entries(entries).filter(
              ([id, entry]) =>
                entry.deleted ||
                !entry.signature ||
                !fresh.prs[id]?.updatedAt ||
                entry.signature === fresh.prs[id].updatedAt,
            ),
          ),
        );
        write("gh_digest_last_snapshot", fresh);
        setSnapshot(fresh);
        setPreviewSnapshot(null);
      } catch (error) {
        if (generation === epoch.current) {
          if (error.resetMs) rateUntil.current = error.resetMs;
          setError(error.message || "Refresh failed.");
        }
      } finally {
        if (generation === epoch.current) setBusy(false);
        if (inflight.current?.generation === generation)
          inflight.current = null;
      }
    })();
    inflight.current = { promise, generation };
    return promise;
  }
  useEffect(() => {
    if (token) {
      refresh();
      const stopScheduler = startRefreshScheduler(
        refresh,
        () =>
          new Worker(new URL("../refresh.worker.js", import.meta.url), {
            type: "module",
          }),
      );
      const visible = () => {
        if (
          document.visibilityState === "visible" &&
          Date.now() - Date.parse(current.current.snapshot?.timestamp || 0) >
            180000
        )
          refresh();
      };
      document.addEventListener("visibilitychange", visible);
      return () => {
        stopScheduler();
        document.removeEventListener("visibilitychange", visible);
      };
    }
  }, [token]);
  async function saveSettings(apply) {
    epoch.current++;
    if (inflight.current) await inflight.current.promise;
    try {
      apply();
    } catch (error) {
      setBusy(false);
      throw error;
    }
    rateUntil.current = 0;
    return refresh();
  }
  const setTeamOnly = (value) => {
    setTeamOnlyState(value);
    localStorage.setItem("gh_digest_teammates", value ? "1" : "");
  };
  const changeView = (value) => {
    setView(value);
    localStorage.setItem("gh_digest_active_view", value);
  };
  const changeFilter = (value) => {
    setNotifFilter(value);
    localStorage.setItem("gh_digest_notif_filter", value);
  };
  function action(type, pr, text) {
    if (type === "pin") setPromoted((items) => toggle(items, pr.id));
    if (type === "stash")
      setStashed((items) => {
        const next = { ...items };
        if (next[pr.id]) delete next[pr.id];
        else next[pr.id] = { archivedAt: new Date().toISOString(), pr };
        return next;
      });
    if (type === "archive")
      setArchived((items) => ({
        ...items,
        [pr.id]: {
          archivedAt: new Date().toISOString(),
          signature: pr.updatedAt || null,
          pr,
        },
      }));
    if (type === "delete")
      setArchived((items) => ({
        ...items,
        [pr.id]: {
          ...items[pr.id],
          deleted: true,
          deletedAt: new Date().toISOString(),
          pr,
        },
      }));
    if (type === "restore")
      setArchived((items) => {
        const next = { ...items };
        delete next[pr.id];
        return next;
      });
    if (type === "note")
      setNotes((items) => {
        const next = { ...items };
        if (text.trim())
          next[pr.id] = { text, savedAt: new Date().toISOString() };
        else delete next[pr.id];
        return next;
      });
  }
  const state = {
    archived,
    stashed,
    notes,
    promoted,
    authors,
    repos,
    sections,
    collapsedAuthors,
    teamOnly,
  };
  return {
    token,
    snapshot:
      snapshot || previewSnapshot
        ? {
            ...(snapshot || previewSnapshot),
            prs: retainSavedPRs(
              (snapshot || previewSnapshot).prs,
              null,
              archived,
              {},
            ),
          }
        : null,
    busy,
    error,
    settings,
    setSettings,
    badges,
    previousTimestamp,
    view,
    notifFilter,
    authors,
    repos,
    teamOnly,
    notifications,
    setNotifications,
    prefs,
    setPrefs,
    connect,
    disconnect,
    refresh,
    saveSettings,
    setTeamOnly,
    changeView,
    changeFilter,
    setAuthors,
    setRepos,
    state,
    action,
    setSections,
    setCollapsedAuthors,
  };
}
