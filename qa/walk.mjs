#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repo);
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const source = readFileSync('USER_STORIES.md', 'utf8');
const sections = [...source.matchAll(/^## (US-\d{3})\b[^\n]*$/gm)];
const live = sections.filter((match, index) => !/\b(?:Retired:|Superseded by US-\d{3})/i.test(source.slice(match.index, sections[index + 1]?.index))).map(match => match[1]);
const observations = {
  'US-001': [
    ['Browser capture preserves image GIF and video originals and genuine indexing intent', 'Process restart retains accounts sessions media favorites and local search'],
    ['Real Chromium device pairing capture search revocation and isolation'],
    ['Malformed unsupported and oversized media and private-network URLs fail safely'],
  ],
  'US-002': [
    ['New semantic queries use real local text/image vectors and render ranked results'],
    ['Owner isolation hides foreign search results and private media'],
  ],
  'US-003': [
    ['Explicit public links revoke immediately and trash restore stays private'],
    ['Owner export and consistent backup restore preserve bytes and invalidate sessions'],
    ['Restore refuses a populated library without modifying its database'],
  ],
};
const extensionObservation = observations['US-001'][1][0];
const args = process.argv.slice(2);
let selected;
if (args.length === 1 && args[0] === '--all') selected = live;
else if (args.length === 2 && args[0] === '--stories') selected = [...new Set(args[1].trim().split(/\s+/).filter(Boolean))];
else throw Error('usage: qa/walk --all | --stories "US-001 US-002"');
for (const id of selected) if (!live.includes(id)) throw Error(`Not a live story: ${id}`);
for (const [index, match] of sections.entries()) {
  if (!live.includes(match[1])) continue;
  const body = source.slice(match.index, sections[index + 1]?.index);
  const numbered = [...body.matchAll(/^(\d+)\. /gm)].map(item => Number(item[1]));
  const expected = observations[match[1]];
  if (!expected || numbered.join(',') !== expected.map((_, n) => n + 1).join(',')) {
    throw Error(`${match[1]}: walk observations do not match every numbered story criterion`);
  }
}
const output = join(repo, 'target/walk');
const marker = join(output, '.sploot-walk-owned');
if (existsSync(output) && !existsSync(marker)) throw Error(`Refusing to replace non-owned walk output: ${output}`);
if (existsSync(marker)) await rm(output, { recursive: true });
await mkdir(join(output, 'evidence'), { recursive: true });
await writeFile(marker, 'Owned by qa/walk; never a production library.\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = {
  schema: 'foundation-walk-receipt/1', check: 'sploot-story-walk', run: process.env.GITHUB_RUN_ID || `local-${Date.now()}`,
  head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
  base: process.env.WALK_BASE ? git('rev-parse', `${process.env.WALK_BASE}^{commit}`) : null,
  started_at: new Date().toISOString(), finished_at: '', exit: 1, stories: [], artifacts: [],
};
async function exercise(command, argv) {
  const child = spawn(command, argv, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { text += chunk.toString(); });
  const forward = () => child.kill('SIGTERM');
  process.once('SIGTERM', forward);
  process.once('SIGINT', forward);
  try {
    const status = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('close', resolveExit); });
    if (status !== 0 || !/"status": "PASS"/.test(text)) {
      const location = text.match(/Private acceptance evidence retained at ([^\n]+)/)?.[1];
      throw Error(`${command} ${argv.join(' ')} exited ${status}; ${location ? `private diagnostics at ${location}` : 'inspect the runner step'}`);
    }
    return new Set([...text.matchAll(/^PASS ([^\n]+)$/gm)].map(match => match[1]));
  } finally {
    process.off('SIGTERM', forward);
    process.off('SIGINT', forward);
  }
}
try {
  const normal = selected.length ? await exercise('pnpm', ['--filter', 'server', 'smoke', '--binary', 'build/sploot']) : new Set();
  const extension = selected.includes('US-001') ? await exercise('xvfb-run', ['-a', 'pnpm', '--filter', 'server', 'smoke', '--extension', '--binary', 'build/sploot']) : new Set();
  for (const id of selected) {
    const criteria = [];
    for (const [index, steps] of observations[id].entries()) {
      const path = `evidence/${id}-${index + 1}.txt`;
      const lines = steps.map(step => {
        const run = step === extensionObservation ? extension : normal;
        if (!run.has(step)) throw Error(`${id} criterion ${index + 1}: no completed acceptance exercise for ${step}`);
        return `PASS ${step}`;
      });
      const evidence = Buffer.from(`${lines.join('\n')}\n`);
      await writeFile(join(output, path), evidence);
      receipt.artifacts.push({ path, sha256: hash(evidence) });
      criteria.push({ n: index + 1, status: 'pass', evidence: [path] });
    }
    receipt.stories.push({ id, status: 'pass', criteria });
    console.log(`${id}: ${criteria.length}/${criteria.length} criteria observed`);
  }
  receipt.exit = 0;
} catch (error) {
  console.error(`Story walk failed: ${error.message}`);
  for (const id of selected) if (!receipt.stories.some(story => story.id === id)) receipt.stories.push({ id, status: 'fail', criteria: [] });
} finally {
  receipt.finished_at = new Date().toISOString();
  await writeFile(join(output, 'walk-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`Receipt: ${output}/walk-receipt.json`);
}
if (receipt.exit !== 0) process.exitCode = 1;
