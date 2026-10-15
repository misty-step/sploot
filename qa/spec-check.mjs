#!/usr/bin/env node
// Repo-owned successor to the story/map/receipt/review parts of harness 6286d103.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveIds, storiesAt, workingStories } from './spec-stories.mjs';

const usage = 'Usage: node qa/spec-check.mjs <check|affected|receipt PATH|review> [--repo DIR] [--base REV] [--all] [--json] [--pr N] [--github-repo OWNER/NAME]';
const headings = {
  'Sub-features': 'sub-features', 'How to get to it (user POV)': 'how-to-get-to-it',
  'Driving it': 'driving-it', Gotchas: 'gotchas',
};
const gapPattern = new RegExp('^(?:doc:(?:README\\.md|DESIGN\\.md|SPEC\\.md|USER_STORIES\\.md|adr|postmortems)|stories:format|skill:verify|walk:US-\\d{3}' +
  '|map:(?:index|US-\\d{3}|features/[^/:]+\\.md:(?:unlinked|stories-line|source-line|story:US-\\d{3}|source:[^\\s,]+' +
  `|heading:(?:${Object.values(headings).join('|')}))))$`);
const extensionPath = /^foundation\/extensions\/[^/]+\.json$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const horizon = date => new Date(Date.parse(`${date}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const describe = issue => issue.gap ? `[${issue.gap}] ${issue.message}` : issue.message;
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
function git(repo, ...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`git ${args.join(' ')}: ${result.error?.message || result.stderr.trim()}`);
  return result.stdout;
}
function fileAt(repo, rev, path) {
  git(repo, 'rev-parse', '--verify', `${rev}^{commit}`);
  return git(repo, 'ls-tree', rev, '--', path).trim() ? git(repo, 'show', `${rev}:${path}`) : undefined;
}
function jsonOrUndefined(contents) { try { return JSON.parse(contents); } catch { return undefined; } }
function baselineData(repo, revision) {
  for (const path of ['qa/story-baseline.json', 'foundation.json']) {
    const contents = revision ? fileAt(repo, revision, path) : existsSync(join(repo, path)) ? readFileSync(join(repo, path), 'utf8') : undefined;
    if (contents !== undefined) return JSON.parse(contents);
  }
  return undefined;
}
function tracked(repo) { return git(repo, 'ls-files', '-z').split('\0').filter(Boolean); }
function changedFiles(repo, base, filter) {
  return git(repo, 'diff', '--name-only', '--no-renames', ...(filter ? [`--diff-filter=${filter}`] : []), '-z', `${base}...HEAD`).split('\0').filter(Boolean);
}
function globRegex(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; source += '(?:.*/)?'; } else source += '.*';
    } else if (ch === '*') source += '[^/]*';
    else source += ch.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}
function features(repo, files, stories, issues) {
  const featureFiles = files.filter(f => /^features\/[^/]+\.md$/.test(f) && f !== 'features/README.md');
  const index = join(repo, 'features/README.md');
  if (!existsSync(index)) issues.push({ gap: 'map:index', message: 'missing features/README.md' });
  const indexText = existsSync(index) ? readFileSync(index, 'utf8') : '';
  const links = new Set([...indexText.matchAll(/\]\((?:\.\/)?([^\s)#]+)(?:#[^)]+)?\)/g)].map(match => match[1]));
  const live = liveIds(stories);
  const mapped = new Set();
  const result = [];
  for (const file of featureFiles) {
    const gap = defect => `map:${file}:${defect}`;
    const body = readFileSync(join(repo, file), 'utf8');
    if (!links.has(file.slice('features/'.length)) && !links.has(file)) issues.push({ gap: gap('unlinked'), message: `${file}: not linked from features/README.md` });
    const storyLine = body.match(/^Stories:\s*(.*)$/m)?.[1];
    const sourceLine = body.match(/^Source:\s*(.*)$/m)?.[1];
    if (!text(storyLine)) issues.push({ gap: gap('stories-line'), message: `${file}: missing Stories: line` });
    if (!text(sourceLine)) issues.push({ gap: gap('source-line'), message: `${file}: missing Source: line` });
    const ids = storyLine?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    const sources = sourceLine?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    for (const id of ids) {
      if (!live.has(id)) issues.push({ gap: gap(`story:${id}`), message: `${file}: ${id} is not a live story` }); else mapped.add(id);
    }
    for (const source of sources) {
      if (!files.some(f => globRegex(source).test(f))) issues.push({ gap: gap(`source:${source}`), message: `${file}: Source: ${source} matches no tracked files` });
    }
    for (const [heading, slug] of Object.entries(headings)) {
      if (!body.split('\n').some(line => line.startsWith(`## ${heading}`))) issues.push({ gap: gap(`heading:${slug}`), message: `${file}: missing ## ${heading}` });
    }
    result.push({ file, stories: ids, sources });
  }
  for (const id of live) if (!mapped.has(id)) issues.push({ gap: `map:${id}`, message: `${id}: absent from every feature` });
  return result;
}
function editedStories(repo, base, head) {
  const old = new Map(storiesAt(repo, git(repo, 'merge-base', base, 'HEAD').trim(), { optional: true }).map(s => [s.id, s.body]));
  return new Set(head.filter(s => s.live && old.get(s.id) !== s.body).map(s => s.id));
}
function affected(repo, base, report) {
  const head = workingStories(repo);
  const live = liveIds(head);
  const mapping = features(repo, tracked(repo), head, report);
  const changed = changedFiles(repo, base);
  const ids = editedStories(repo, base, head);
  for (const feature of mapping) {
    if (changed.includes(feature.file) || changed.some(file => feature.sources.some(glob => globRegex(glob).test(file)))) {
      for (const id of feature.stories) if (live.has(id)) ids.add(id);
    }
  }
  return [...ids].sort();
}
function readBaseline(data, live, errors, now) {
  if (!record(data)) return { mode: 'enforced', entries: [] };
  const mode = data.mode ?? 'enforced';
  if (!['bootstrap', 'enforced'].includes(mode)) errors.push('baseline: mode must be bootstrap or enforced');
  const raw = data.baseline ?? [];
  const entries = [];
  if (!Array.isArray(raw)) errors.push('baseline: must be an array');
  else {
    const seen = new Set();
    for (const item of raw) {
      if (!record(item) || !text(item.gap) || !gapPattern.test(item.gap)) { errors.push(`baseline: invalid gap ${JSON.stringify(item)}`); continue; }
      if (!text(item.owner) || !isDate(item.expires)) { errors.push(`baseline ${item.gap}: needs an owner and expires YYYY-MM-DD`); continue; }
      if (seen.has(item.gap)) { errors.push(`baseline ${item.gap}: duplicate entry`); continue; }
      seen.add(item.gap); entries.push({ gap: item.gap, owner: item.owner, expires: item.expires });
    }
    if (mode === 'bootstrap' && !raw.length) errors.push('baseline: empty bootstrap must be enforced');
  }
  if (mode === 'enforced' && entries.length) errors.push('baseline: enforced mode cannot carry entries');
  for (const entry of entries) {
    if (entry.expires < now) errors.push(`baseline ${entry.gap}: expired ${entry.expires}`);
    else if (entry.expires > horizon(now)) errors.push(`baseline ${entry.gap}: expires more than 30 days out`);
    const story = entry.gap.match(/^walk:(US-\d{3})$/)?.[1];
    if (story && !live.has(story)) errors.push(`baseline ${entry.gap}: not a live story`);
  }
  return { mode, entries };
}
function covering(baseline, live, now) {
  if (baseline.mode !== 'bootstrap') return new Map();
  return new Map(baseline.entries.filter(entry => {
    const story = entry.gap.match(/^walk:(US-\d{3})$/)?.[1];
    return entry.expires >= now && entry.expires <= horizon(now) && (!story || live.has(story));
  }).map(entry => [entry.gap, entry]));
}
function uncovered(report, data, live) {
  const now = today();
  const excused = covering(readBaseline(data, live, [], now), live, now);
  return report.filter(issue => !issue.gap || !excused.has(issue.gap)).map(describe);
}
function ratchet(repo, base, baseline, errors) {
  const prior = baselineData(repo, git(repo, 'merge-base', base, 'HEAD').trim());
  for (const id of editedStories(repo, base, workingStories(repo))) {
    if (baseline.entries.some(entry => entry.gap === `map:${id}`)) errors.push(`${id}: edited; remove baseline map:${id}`);
  }
  if (prior === undefined) return;
  const expiry = new Map();
  if (record(prior) && prior.mode === 'bootstrap' && Array.isArray(prior.baseline)) {
    for (const item of prior.baseline) if (record(item) && text(item.gap) && isDate(item.expires)) expiry.set(item.gap, item.expires);
  }
  const extended = baseline.entries.filter(entry => !expiry.has(entry.gap) || entry.expires > expiry.get(entry.gap));
  const records = new Map();
  for (const path of changedFiles(repo, base, 'A').filter(f => extensionPath.test(f))) {
    const value = jsonOrUndefined(fileAt(repo, 'HEAD', path));
    if (!record(value) || value.schema !== 'foundation-baseline-extension/1' || !text(value.reason) || !Array.isArray(value.entries) || !value.entries.length) {
      errors.push(`${path}: needs schema foundation-baseline-extension/1, a reason and entries`); continue;
    }
    for (const entry of value.entries) {
      if (!record(entry) || !text(entry.gap) || !gapPattern.test(entry.gap) || !isDate(entry.expires)) { errors.push(`${path}: invalid entry`); continue; }
      if (records.has(entry.gap)) errors.push(`${path}: ${entry.gap} is extended twice`);
      records.set(entry.gap, entry.expires);
    }
  }
  for (const entry of extended) if (records.get(entry.gap) !== entry.expires) errors.push(`baseline ${entry.gap}: add a foundation/extensions/ record for designated review`);
  for (const [gap, expires] of records) if (!extended.some(entry => entry.gap === gap && entry.expires === expires)) errors.push(`foundation/extensions: ${gap} is not an extension in this change`);
}
function check(options) {
  const repo = options.repo;
  const errors = [];
  // SPEC parsing is mandatory, never an excusable bootstrap gap.
  const stories = workingStories(repo);
  const live = liveIds(stories);
  const issues = [];
  for (const path of ['README.md', 'DESIGN.md']) if (!existsSync(join(repo, path))) issues.push({ gap: `doc:${path}`, message: `missing ${path}` });
  const adr = join(repo, 'docs/adr');
  if (!existsSync(adr) || !readdirSync(adr).some(f => f.endsWith('.md') && statSync(join(adr, f)).isFile())) issues.push({ gap: 'doc:adr', message: 'docs/adr/ needs at least one ADR' });
  if (!['README.md', 'TEMPLATE.md'].some(f => existsSync(join(repo, 'docs/postmortems', f)))) issues.push({ gap: 'doc:postmortems', message: 'docs/postmortems/ needs README.md or TEMPLATE.md' });
  features(repo, tracked(repo), stories, issues);
  if (!tracked(repo).filter(f => /^(?:\.agents\/skills|skills)\/[^/]+\/SKILL\.md$/.test(f)).some(f => {
    const body = readFileSync(join(repo, f), 'utf8');
    return ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup'].every(h => body.split('\n').some(line => line.startsWith(`## ${h}`)));
  })) issues.push({ gap: 'skill:verify', message: 'missing verify skill with Launch, Doctor, Drive, Evidence and Cleanup' });
  const data = baselineData(repo);
  if (!record(data)) errors.push('missing or invalid qa/story-baseline.json');
  const now = today();
  const baseline = readBaseline(data, live, errors, now);
  const excused = covering(baseline, live, now);
  const baselined = [];
  for (const issue of issues) {
    const entry = excused.get(issue.gap);
    if (entry) baselined.push(`${describe(issue)} (owner ${entry.owner}, expires ${entry.expires})`); else errors.push(describe(issue));
  }
  const open = new Set(issues.map(issue => issue.gap));
  for (const entry of baseline.entries) if (!entry.gap.startsWith('walk:') && !open.has(entry.gap)) errors.push(`baseline ${entry.gap}: fixed; remove entry`);
  if (options.base) ratchet(repo, options.base, baseline, errors);
  return { ok: !errors.length, errors, baselined };
}
function safePath(path) { return text(path) && !isAbsolute(path) && !path.split(/[\\/]/).some(part => ['..', '.', ''].includes(part)); }
function receipt(options) {
  const errors = [];
  const path = resolve(options.repo, options.receipt);
  const value = readJson(path);
  if (!record(value) || value.schema !== 'foundation-walk-receipt/1') return { ok: false, errors: ['receipt: invalid schema'] };
  if (![value.check, value.run, value.started_at, value.finished_at].every(text)) errors.push('receipt: check, run and timestamps required');
  if (value.head !== git(options.repo, 'rev-parse', 'HEAD').trim()) errors.push('receipt: head differs from HEAD');
  if (value.tree !== git(options.repo, 'rev-parse', 'HEAD^{tree}').trim()) errors.push('receipt: tree differs from HEAD tree');
  if (value.exit !== 0) errors.push('receipt: exit must be 0');
  const stories = storiesAt(options.repo, 'HEAD');
  const criteriaAtHead = new Map(stories.map(story => [story.id, story.criteria.map(c => c.n)]));
  const live = liveIds(stories);
  const data = baselineData(options.repo, 'HEAD');
  let expected = [];
  const unmapped = new Set();
  if (options.base) {
    if (value.base !== git(options.repo, 'rev-parse', `${options.base}^{commit}`).trim()) errors.push('receipt: base differs from requested base');
    const report = [];
    expected = affected(options.repo, options.base, report);
    for (const issue of report) { const id = issue.gap?.match(/^map:(US-\d{3})$/)?.[1]; if (id) unmapped.add(id); }
    errors.push(...uncovered(report, data, live));
  } else if (value.base !== null && !/^[0-9a-f]{40}$/.test(String(value.base))) errors.push('receipt: base must be a commit or null');
  const now = today();
  const baseline = readBaseline(data, live, errors, now);
  const excused = covering(baseline, live, now);
  const provable = options.base !== undefined || value.base === null;
  const artifacts = new Set();
  if (!Array.isArray(value.artifacts)) errors.push('receipt: artifacts must be an array');
  else for (const artifact of value.artifacts) {
    if (!record(artifact) || !safePath(artifact.path) || !/^[0-9a-f]{64}$/.test(String(artifact.sha256))) { errors.push('receipt: invalid artifact entry'); continue; }
    const name = artifact.path;
    if (artifacts.has(name)) errors.push(`receipt: duplicate artifact ${name}`);
    artifacts.add(name);
    const file = join(dirname(path), name);
    if (!existsSync(file) || !statSync(file).isFile() || hash(readFileSync(file)) !== artifact.sha256) errors.push(`receipt: artifact ${name} missing or digest mismatch`);
  }
  const reported = new Set();
  if (!Array.isArray(value.stories)) errors.push('receipt: stories must be an array');
  else for (const story of value.stories) {
    if (!record(story) || !/^US-\d{3}$/.test(String(story.id)) || !['pass', 'fail', 'unwalked'].includes(story.status)) { errors.push('receipt: invalid story entry'); continue; }
    const id = story.id;
    if (reported.has(id)) errors.push(`receipt: duplicate story ${id}`);
    reported.add(id);
    if (!criteriaAtHead.has(id)) { errors.push(`receipt: ${id} is not a story at HEAD`); continue; }
    if (story.status === 'unwalked') {
      if (!excused.has(`walk:${id}`)) errors.push(`receipt: ${id} is unwalked`);
      else if (!provable) errors.push(`receipt: ${id} is unwalked; change receipt needs --base`);
      else if (unmapped.has(id)) errors.push(`receipt: ${id} is unwalked but unmapped`);
      else if (expected.includes(id)) errors.push(`receipt: ${id} is affected and must be walked`);
      continue;
    }
    if (story.status !== 'pass') errors.push(`receipt: ${id} is ${story.status}`);
    else if (options.all && baseline.entries.some(entry => entry.gap === `walk:${id}`)) errors.push(`receipt: ${id} passed; remove baseline walk:${id}`);
    if (!Array.isArray(story.criteria) || !story.criteria.length) errors.push(`receipt: ${id} needs criteria`);
    else {
      for (const criterion of story.criteria) {
        if (!record(criterion) || !Number.isInteger(criterion.n) || criterion.status !== 'pass' || !Array.isArray(criterion.evidence) || !criterion.evidence.length) { errors.push(`receipt: ${id} has unpassed or invalid criterion`); continue; }
        for (const evidence of criterion.evidence) if (!safePath(evidence) || !artifacts.has(evidence)) errors.push(`receipt: ${id} evidence ${String(evidence)} is not listed in artifacts`);
      }
      const numbers = story.criteria.map(c => record(c) ? Number(c.n) : NaN).sort((a, b) => a - b);
      if (numbers.join(',') !== criteriaAtHead.get(id).join(',')) errors.push(`receipt: ${id} criteria do not match story criteria at HEAD`);
    }
  }
  for (const id of expected) if (!reported.has(id)) errors.push(`receipt: affected ${id} is missing`);
  if (options.all) for (const id of live) if (!reported.has(id)) errors.push(`receipt: ${id} is missing from a full walk`);
  return { ok: !errors.length, errors };
}
function reviewTriggers(repo, base, head) {
  const mergeBase = git(repo, 'merge-base', base, head).trim();
  const before = storiesAt(repo, mergeBase, { optional: true });
  const after = storiesAt(repo, head);
  const reasons = [];
  if (!before.length && after.length) reasons.push('first user stories: SPEC.md gains its first stories');
  const added = git(repo, 'diff', '--name-only', '--no-renames', '--diff-filter=A', '-z', mergeBase, head).split('\0').filter(Boolean);
  for (const path of added.filter(f => extensionPath.test(f))) reasons.push(`baseline extension: ${path}`);
  return reasons;
}
async function github(path, token) {
  const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const response = await fetch(`${api}${path}`, { headers: {
    Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sploot-spec-check',
  } });
  if (!response.ok) throw Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.json();
}
async function review(options) {
  const [org, name, extra] = (options.githubRepo ?? process.env.GITHUB_REPOSITORY ?? '').split('/');
  if (!org || !name || extra !== undefined) throw Error('review needs --github-repo OWNER/NAME or GITHUB_REPOSITORY');
  const token = process.env.GITHUB_TOKEN;
  if (!text(token)) throw Error('review needs GITHUB_TOKEN');
  const pull = await github(`/repos/${org}/${name}/pulls/${options.pr}`, token);
  const head = pull?.head?.sha;
  const base = pull?.base?.sha;
  const author = pull?.user?.login;
  if (!text(head) || !text(base) || !text(author)) throw Error('GitHub API: pull request has no head, base or author');
  for (const sha of [head, base]) git(options.repo, 'cat-file', '-e', `${sha}^{commit}`);
  const reasons = reviewTriggers(options.repo, base, head);
  if (!reasons.length) return { ok: true, errors: [], reasons };
  if (org !== 'misty-step') throw Error(`no designated reviewer for ${org}`);
  const agent = 'kaylee-agent[bot]'; // Existing ADR-003 identity; no PR-controlled override.
  if (agent === author) return { ok: false, errors: ['designated reviewer authored this PR'], reasons };
  const reviews = [];
  for (let page = 1; ; page++) {
    const batch = await github(`/repos/${org}/${name}/pulls/${options.pr}/reviews?per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw Error('GitHub API: reviews is not a list');
    reviews.push(...batch.filter(record));
    if (batch.length < 100) break;
  }
  const own = entry => entry.user?.login === agent;
  let escalation = -1;
  let decision;
  reviews.forEach((entry, index) => {
    if (own(entry) && entry.commit_id === head && ['COMMENTED', 'CHANGES_REQUESTED'].includes(entry.state) && typeof entry.body === 'string' && entry.body.includes('foundation-escalation: product-direction')) escalation = index;
    if (own(entry) && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(entry.state)) decision = { entry, index };
  });
  const approved = decision?.entry.state === 'APPROVED' && decision.entry.commit_id === head;
  const errors = [];
  if (escalation >= 0 && !(approved && decision.index > escalation && typeof decision.entry.body === 'string' && decision.entry.body.split('\n')[0].trimEnd() === 'foundation-escalation: resolved')) {
    errors.push(`escalated on head ${head.slice(0, 12)}; needs later designated approval with exact first line foundation-escalation: resolved`);
  } else if (!approved) errors.push(`needs an approving review from ${agent} on head ${head.slice(0, 12)}`);
  return { ok: !errors.length, errors, reasons, approved_by: errors.length ? undefined : agent };
}
function args(argv) {
  const command = argv[0];
  if (!['check', 'affected', 'receipt', 'review'].includes(command)) throw Error(usage);
  const options = { command, repo: process.cwd(), json: false, all: false };
  const valued = { '--repo': 'repo', '--base': 'base', '--pr': 'pr', '--github-repo': 'githubRepo' };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--all') options.all = true;
    else if (valued[arg]) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw Error(`${arg} requires a value`);
      options[valued[arg]] = value;
    } else if (command === 'receipt' && !options.receipt && !arg.startsWith('-')) options.receipt = arg;
    else throw Error(`unexpected argument: ${arg}`);
  }
  if (command === 'affected' && !options.base) throw Error('affected requires --base');
  if (command === 'receipt' && !options.receipt) throw Error('receipt requires PATH');
  if (command === 'review' && (!/^[1-9]\d*$/.test(options.pr) || options.base)) throw Error('review requires --pr N and uses GitHub base/head, not --base');
  if (command !== 'review' && (options.pr || options.githubRepo)) throw Error('--pr and --github-repo are only valid for review');
  if (command !== 'receipt' && options.all) throw Error('--all is only valid for receipt');
  options.repo = resolve(options.repo);
  return options;
}
export async function main(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { console.log(usage); return; }
  const options = args(argv);
  let result;
  try {
    if (options.command === 'check') result = check(options);
    else if (options.command === 'receipt') result = receipt(options);
    else if (options.command === 'review') result = await review(options);
    else {
      const report = [];
      const stories = affected(options.repo, options.base, report);
      const errors = uncovered(report, baselineData(options.repo), liveIds(workingStories(options.repo)));
      result = { ok: !errors.length, errors, stories };
    }
  } catch (error) { result = { ok: false, errors: [error.message] }; }
  if (options.json) console.log(JSON.stringify(result));
  else if (options.command === 'affected' && result.ok) console.log(result.stories.join(' '));
  else {
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    console.log(`spec-check ${options.command}: ${result.ok ? 'PASS' : 'FAIL'}`);
  }
  if (!result.ok) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
}
