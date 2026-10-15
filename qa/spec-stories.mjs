import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// One parser for the product walk and every gate. SPEC is current authority;
// the legacy regular file is read only from pre-migration Git history.
export function parseStories(contents) {
  const lines = contents.split('\n');
  const stories = [];
  let current;
  for (const line of lines) {
    const match = line.match(/^## (US-\d{3})(?:\s|$)/);
    if (/^## US-/.test(line) && !match) throw Error('stories: malformed US-XXX heading');
    if (match) {
      current = { id: match[1], live: !/\(retired\)/.test(line), lines: [line], criteria: [] };
      stories.push(current);
    } else if (/^## /.test(line)) current = undefined;
    else if (current) current.lines.push(line);
  }
  const ids = new Set();
  for (const story of stories) {
    if (ids.has(story.id)) throw Error(`stories: duplicate ${story.id}`);
    ids.add(story.id);
    story.body = story.lines.join('\n');
    const formatRetired = /\(retired\)/.test(story.lines[0]) || /^Retired:/m.test(story.body);
    if (formatRetired || /Superseded by US-\d{3}/.test(story.body)) story.live = false;
    let inCriteria = false;
    let criterion;
    for (const line of story.lines) {
      if (/^Criteria:/.test(line)) { inCriteria = true; continue; }
      if (/^(?:[A-Z][A-Za-z-]*:|#{2,} )/.test(line)) inCriteria = false;
      if (!inCriteria) continue;
      const numbered = line.match(/^(\d+)\. (.*)/);
      if (numbered) { criterion = { n: Number(numbered[1]), text: numbered[2] }; story.criteria.push(criterion); }
      else if (criterion) criterion.text += `\n${line}`;
    }
    if (!formatRetired) {
      if (!/^Statement:[ \t]*\S/m.test(story.body)) throw Error(`${story.id}: missing Statement`);
      if (/TODO|TBD/.test(story.body)) throw Error(`${story.id}: contains TODO/TBD`);
      if (!story.criteria.length || story.criteria.some((c, i) => c.n !== i + 1 || !/\bSHALL\b/.test(c.text))) {
        throw Error(`${story.id}: criteria must be consecutive numbered SHALL requirements`);
      }
    }
  }
  if (!stories.length) throw Error('stories: no ## US-XXX headings');
  for (const target of contents.matchAll(/Superseded by (US-\d{3})/g)) {
    if (!ids.has(target[1])) throw Error(`stories: supersede target ${target[1]} does not resolve`);
  }
  return stories;
}

export function workingStories(repo) {
  const path = join(repo, 'SPEC.md');
  if (!lstatSync(path).isFile()) throw Error('SPEC.md must be a regular file');
  return parseStories(readFileSync(path, 'utf8'));
}

export function storiesAt(repo, revision, { optional = false } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  // Validate the revision before checking absence, so a bad base cannot look empty.
  git('rev-parse', '--verify', `${revision}^{commit}`);
  for (const path of ['SPEC.md', 'USER_STORIES.md']) {
    const entry = git('ls-tree', revision, '--', path).trim();
    if (!entry) continue;
    if (!/^100(?:644|755) blob /.test(entry)) throw Error(`${revision}:${path} must be a regular file`);
    return parseStories(git('show', `${revision}:${path}`));
  }
  if (optional) return [];
  throw Error(`${revision}: missing SPEC.md (or historical USER_STORIES.md)`);
}

export const liveIds = stories => new Set(stories.filter(story => story.live).map(story => story.id));
