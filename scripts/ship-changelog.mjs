// Ships a changelog to Discord from git history.
//
// Source of truth = git commits. Both Claude sessions (builder + thinker) and you
// commit normally; this reads everything since the last ship, posts a single
// curated update to Discord, appends it to CHANGELOG.md, and moves a marker tag
// forward so the next ship starts where this one ended.
//
// Usage:
//   node scripts/ship-changelog.mjs            -> ship since last marker
//   node scripts/ship-changelog.mjs --dry      -> print what would be sent, post nothing
//   node scripts/ship-changelog.mjs --all      -> ship the entire history (ignore marker)
//
// Webhook URL is read from (in order): env DISCORD_WEBHOOK_URL, then .dev/discord-webhook

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MARKER = 'last-changelog';
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const ALL = args.has('--all');

function git(cmd, opts = {}) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', ...opts }).trim();
}

function getWebhook() {
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL.trim();
  if (existsSync('.dev/discord-webhook')) return readFileSync('.dev/discord-webhook', 'utf8').trim();
  return null;
}

function markerExists() {
  try { git(`rev-parse --verify ${MARKER}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// --- gather commits since the marker --------------------------------------
const useRange = !ALL && markerExists();
const range = useRange ? `${MARKER}..HEAD` : '';
const SEP = '\x1f'; // unit separator, safe inside commit subjects

let raw;
try {
  raw = git(`log ${range} --no-merges --pretty=format:%s${SEP}%an${SEP}%ad --date=short`);
} catch {
  console.error('No commits found. Make at least one commit first.');
  process.exit(1);
}

if (!raw) {
  console.log('Nothing new since the last changelog. Make some commits, then ship again.');
  process.exit(0);
}

const commits = raw.split('\n').filter(Boolean).map((line) => {
  const [subject, author, date] = line.split(SEP);
  // Pull a leading [tag] off the subject if present, e.g. "[builder] Add water"
  const m = subject.match(/^\[([^\]]+)\]\s*(.*)$/);
  return {
    group: m ? m[1].toLowerCase() : 'other',
    text: m ? m[2] : subject,
    author,
    date,
  };
});

// --- format ---------------------------------------------------------------
const order = ['builder', 'thinker', 'other'];
const label = { builder: '🔨 Builder', thinker: '🧠 Thinker', other: '📦 Other' };

const grouped = {};
for (const c of commits) (grouped[c.group] ??= []).push(c);

const today = new Date().toISOString().slice(0, 10);
let body = '';
for (const key of [...order, ...Object.keys(grouped).filter((k) => !order.includes(k))]) {
  const list = grouped[key];
  if (!list || !list.length) continue;
  body += `**${label[key] ?? key}**\n`;
  for (const c of list) body += `• ${c.text}\n`;
  body += '\n';
}
body = body.trim();

const heading = `## Dev update — ${today}`;
const markdown = `${heading}\n\n${body}\n`;

// --- dry run --------------------------------------------------------------
if (DRY) {
  console.log('--- would post to Discord ---\n');
  console.log(markdown);
  console.log(`\n(${commits.length} commit(s), range: ${range || 'ALL'})`);
  process.exit(0);
}

// --- post to Discord ------------------------------------------------------
const webhook = getWebhook();
if (!webhook) {
  console.error('No webhook configured. Set DISCORD_WEBHOOK_URL or create .dev/discord-webhook');
  process.exit(1);
}

const embed = {
  title: `Dev update — ${today}`,
  description: body.slice(0, 4000),
  color: 0x5865f2,
  footer: { text: `${commits.length} change(s) • skilling-island` },
  timestamp: new Date().toISOString(),
};

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ embeds: [embed] }),
});

if (!res.ok) {
  console.error(`Discord rejected the post: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

// --- record it: append to CHANGELOG.md + advance the marker ---------------
const changelogPath = 'CHANGELOG.md';
const prior = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '# Changelog\n';
const insertAt = prior.indexOf('\n') + 1; // keep the "# Changelog" title on top
const next = prior.slice(0, insertAt) + '\n' + markdown + prior.slice(insertAt);
writeFileSync(changelogPath, next);

git(`tag -f ${MARKER} HEAD`);

console.log(`Shipped ${commits.length} change(s) to Discord.`);
console.log(`Updated CHANGELOG.md and moved '${MARKER}' to HEAD.`);
console.log(`Commit the CHANGELOG.md + tag update to keep history in sync.`);
