#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const statePath = resolve(process.env.GH_DIGEST_STATE || `${scriptDir}/state.json`);
const org = process.env.GH_DIGEST_ORG || 'ardoq';
const ghBinary = process.env.GH_BIN || '/opt/homebrew/bin/gh';
const notifierBinary = process.env.TERMINAL_NOTIFIER_BIN || '/opt/homebrew/bin/terminal-notifier';
const tokenPath = process.env.GH_DIGEST_TOKEN_FILE || '/Users/Oluwanifemi/.config/github-digest/token';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ghJson(args) {
  return JSON.parse(run(ghBinary, ['api', ...args]));
}

function loadToken() {
  const token = readFileSync(tokenPath, 'utf8').trim();
  if (!token) throw new Error(`Token file is empty: ${tokenPath}`);
  return token;
}

function loadState() {
  if (!existsSync(statePath)) return { seen: [] };
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    return { seen: Array.isArray(state.seen) ? state.seen : [] };
  } catch {
    return { seen: [] };
  }
}

function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function notificationUrl(notification) {
  const apiUrl = notification.subject?.url;
  const match = apiUrl?.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
  return match ? `https://github.com/${match[1]}/pull/${match[2]}` : notification.repository?.html_url || '';
}

function notificationPrId(notification) {
  const apiUrl = notification.subject?.url;
  const match = apiUrl?.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
  return match ? `${match[1]}#${match[2]}` : notification.repository?.full_name || notification.id;
}

function preview(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatEventTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function directReviewRequests(login) {
  const query = `query { search(query: "is:pr is:open org:${org} review-requested:${login}", type: ISSUE, first: 100) { nodes { ... on PullRequest { id number title url author { login } updatedAt isDraft repository { nameWithOwner } } } } }`;
  const data = ghJson(['graphql', '-f', `query=${query}`]);
  return data.data.search.nodes.filter(pr => !pr.isDraft).map(pr => ({
    key: `review-requested:${pr.id}`,
    legacyKeyPrefix: `review-requested:${pr.id}:`,
    type: 'review-requested',
    prId: `${pr.repository.nameWithOwner}#${pr.number}`,
    title: `${pr.author?.login || 'Someone'} requested your review`,
    message: `${pr.repository.nameWithOwner}#${pr.number}: ${pr.title}`,
    url: pr.url,
    occurredAt: pr.updatedAt,
  }));
}

function directNotifications() {
  const notifications = ghJson(['notifications?participating=false&per_page=100']);
  return notifications.flatMap(notification => {
    if (notification.subject?.type !== 'PullRequest') return [];

    const event = {
      mention: ['You were mentioned', notification.subject.title],
      assign: ['You were assigned', notification.subject.title],
    }[notification.reason];

    if (!event) return [];
    return [{
      key: `notification:${notification.id}`,
      legacyKeyPrefix: `notification:${notification.id}:`,
      type: notification.reason,
      prId: notificationPrId(notification),
      title: event[0],
      message: `${notificationPrId(notification)}: ${event[1]}`,
      url: notificationUrl(notification),
      occurredAt: notification.updated_at,
    }];
  });
}

function isBot(login) {
  return !login || login.endsWith('[bot]') || login.toLowerCase().includes('bot');
}

function myOpenPullRequests(login) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = `query { search(query: "is:pr is:open org:${org} author:${login} updated:>=${since}", type: ISSUE, first: 100) { nodes { ... on PullRequest { number title url repository { nameWithOwner } } } } }`;
  const data = ghJson(['graphql', '-f', `query=${query}`]);
  return data.data.search.nodes;
}

function reviewAndReplyEvents(login) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const events = [];

  for (const pr of myOpenPullRequests(login)) {
    const [owner, repo] = pr.repository.nameWithOwner.split('/');
    const apiRoot = `repos/${owner}/${repo}/pulls/${pr.number}`;

    for (const review of ghJson([`${apiRoot}/reviews?per_page=100`])) {
      if (review.user?.login === login || isBot(review.user?.login)) continue;
      if (review.state !== 'CHANGES_REQUESTED' || Date.parse(review.submitted_at) < cutoff) continue;
      events.push({
        key: `changes-requested:${pr.repository.nameWithOwner}:${pr.number}:${review.id}`,
        type: 'changes-requested',
        prId: `${pr.repository.nameWithOwner}#${pr.number}`,
        title: `${review.user.login} requested changes`,
        message: `${pr.repository.nameWithOwner}#${pr.number}: ${pr.title}`,
        url: pr.url,
        occurredAt: review.submitted_at,
      });
    }

    const comments = [
      ...ghJson([`${apiRoot}/comments?per_page=100`]),
      ...ghJson([`repos/${owner}/${repo}/issues/${pr.number}/comments?per_page=100`]),
    ];
    for (const comment of comments) {
      if (comment.user?.login === login || isBot(comment.user?.login)) continue;
      if (Date.parse(comment.created_at) < cutoff) continue;
      events.push({
        key: `comment:${pr.repository.nameWithOwner}:${pr.number}:${comment.id}`,
        type: comment.in_reply_to_id ? 'reply' : 'comment',
        prId: `${pr.repository.nameWithOwner}#${pr.number}`,
        title: comment.in_reply_to_id ? `${comment.user.login} replied to you` : `${comment.user.login} commented`,
        message: `${pr.repository.nameWithOwner}#${pr.number}: ${pr.title}`,
        url: comment.html_url || pr.url,
        preview: preview(comment.body),
        occurredAt: comment.created_at,
      });
    }
  }

  return events;
}

function notify(events) {
  const grouped = Map.groupBy(events, event => event.prId);
  for (const [prId, prEvents] of grouped) {
    const replies = prEvents.filter(event => event.type === 'reply');
    const comments = prEvents.filter(event => event.type === 'comment');
    const other = prEvents.filter(event => !['reply', 'comment'].includes(event.type));
    const isSingleEvent = prEvents.length === 1;
    const title = isSingleEvent ? prEvents[0].title : `${prEvents.length} updates on ${prId}`;
    const lines = [
      ...other.map(event => isSingleEvent ? event.message : `${event.title}: ${event.message}`),
      ...(comments.length ? [`${comments.length} comment${comments.length === 1 ? '' : 's'} from ${[...new Set(comments.map(event => event.title.replace(' commented', '')))].join(', ')}`] : []),
      ...replies.map(event => `${event.title}${event.preview ? `: “${event.preview}”` : ''}`),
    ];
    const latestEventTime = prEvents
      .map(event => event.occurredAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const formattedEventTime = formatEventTime(latestEventTime);
    if (formattedEventTime) lines.push(formattedEventTime);
    const args = ['-title', title, '-message', lines.join('\n').slice(0, 240)];
    if (prEvents[0].url) args.push('-open', prEvents[0].url);
    run(notifierBinary, args);
  }
}

function main() {
  process.env.GH_TOKEN = loadToken();
  const login = run(ghBinary, ['api', 'user', '--jq', '.login']);
  const state = loadState();
  const seen = new Set(state.seen);
  const events = [
    ...directReviewRequests(login),
    ...directNotifications(),
    ...reviewAndReplyEvents(login),
  ]
    .filter(event => !seen.has(event.key) && ![...seen].some(key => event.legacyKeyPrefix && key.startsWith(event.legacyKeyPrefix)));

  if (events.length > 0) notify(events);

  const retainedKeys = [...seen, ...events.map(event => event.key)];
  saveState({ seen: retainedKeys, updatedAt: new Date().toISOString() });
}

try {
  main();
} catch (error) {
  console.error(`GitHub Digest watcher failed: ${error.stderr?.trim() || error.message}`);
  process.exitCode = 1;
}
