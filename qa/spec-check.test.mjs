import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { parseStories, storiesAt, workingStories } from './spec-stories.mjs';

const checker = fileURLToPath(new URL('./spec-check.mjs', import.meta.url));
const root = resolve(dirname(checker), '..');
const syntheticStory = '# Synthetic test fixture, not product evidence\n\n## US-001 Test capture\nStatement: Save a synthetic image.\nCriteria:\n1. THE SYSTEM SHALL save the synthetic bytes.\n';
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const put = (repo, path, content) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), content); };
const commit = repo => { git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'test: synthetic fixture'); return git(repo, 'rev-parse', 'HEAD'); };
function fixture(t, { legacy = false, empty = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'sploot-spec-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q'); git(repo, 'config', 'user.name', 'Synthetic Test'); git(repo, 'config', 'user.email', 'synthetic@example.invalid');
  put(repo, 'README.md', 'Synthetic fixture\n'); put(repo, 'DESIGN.md', 'Synthetic design\n');
  put(repo, 'docs/adr/test.md', 'Synthetic ADR\n'); put(repo, 'docs/postmortems/README.md', 'Synthetic postmortem\n');
  put(repo, '.agents/skills/test/SKILL.md', ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup'].map(h => `## ${h}`).join('\n'));
  put(repo, 'features/README.md', '[test](test.md)\n');
  put(repo, 'features/test.md', 'Stories: US-001\nSource: capture.mjs, SPEC.md\n## Sub-features\n## How to get to it (user POV)\n## Driving it\n## Gotchas\n');
  put(repo, 'capture.mjs', '// synthetic source\n');
  if (!empty) put(repo, legacy ? 'USER_STORIES.md' : 'SPEC.md', syntheticStory);
  put(repo, legacy ? 'foundation.json' : 'qa/story-baseline.json', JSON.stringify({ mode: 'enforced', baseline: [] }));
  return { repo, base: commit(repo) };
}
function cli(repo, ...args) {
  const result = execFileSyncResult([checker, ...args, '--repo', repo, '--json']);
  return { ...result, value: JSON.parse(result.stdout) };
}
function execFileSyncResult(args) {
  try { return { status: 0, stdout: execFileSync(process.execPath, args, { encoding: 'utf8' }) }; }
  catch (error) { return { status: error.status, stdout: error.stdout, stderr: error.stderr }; }
}
function syntheticReceipt(repo) {
  // This is a gate-test artifact, not a claimed product walk.
  const bytes = 'SYNTHETIC gate-test artifact\n';
  put(repo, 'output/evidence.txt', bytes);
  const value = {
    schema: 'foundation-walk-receipt/1', check: 'synthetic-test', run: 'synthetic-test',
    started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:00:01Z', exit: 0,
    head: git(repo, 'rev-parse', 'HEAD'), tree: git(repo, 'rev-parse', 'HEAD^{tree}'), base: null,
    artifacts: [{ path: 'evidence.txt', sha256: createHash('sha256').update(bytes).digest('hex') }],
    stories: [{ id: 'US-001', status: 'pass', criteria: [{ n: 1, status: 'pass', evidence: ['evidence.txt'] }] }],
  };
  const save = () => put(repo, 'output/receipt.json', JSON.stringify(value));
  save();
  return { value, save };
}
function dateAfter(days) { return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10); }
function baseline(repo, entries) { put(repo, 'qa/story-baseline.json', JSON.stringify({ mode: entries.length ? 'bootstrap' : 'enforced', baseline: entries })); }
async function reviewProbe(t, repo, base, head, reviews, author = 'synthetic-author') {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/repos/misty-step/sploot/pulls/404') response.end(JSON.stringify({ base: { sha: base }, head: { sha: head }, user: { login: author } }));
    else if (request.url.startsWith('/repos/misty-step/sploot/pulls/404/reviews?')) {
      const page = Number(new URL(request.url, 'http://localhost').searchParams.get('page'));
      response.end(JSON.stringify(reviews.slice((page - 1) * 100, page * 100)));
    } else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  t.after(() => server.close());
  const env = { ...process.env, GITHUB_TOKEN: 'synthetic-not-a-credential', GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` };
  try {
    const result = await promisify(execFile)(process.execPath, [checker, 'review', '--repo', repo, '--pr', '404', '--github-repo', 'misty-step/sploot', '--json'], { env });
    return { status: 0, value: JSON.parse(result.stdout) };
  } catch (error) { return { status: error.code, value: JSON.parse(error.stdout) }; }
}
const approval = (head, state = 'APPROVED', body = '', login = 'kaylee-agent[bot]') => ({ user: { login }, commit_id: head, state, body });
function addExtension(repo) {
  put(repo, 'foundation/extensions/test.json', JSON.stringify({ schema: 'foundation-baseline-extension/1', reason: 'Synthetic test extension', entries: [{ gap: 'walk:US-001', expires: dateAfter(2) }] }));
  return commit(repo);
}

test('current SPEC exposes the same three stories and all eight numbered criteria', () => {
  const stories = workingStories(root);
  assert.deepEqual(stories.map(s => [s.id, s.criteria.map(c => c.n)]), [['US-001', [1, 2, 3]], ['US-002', [1, 2]], ['US-003', [1, 2, 3]]]);
});

test('Git-object migration resolves SPEC, never the legacy symlink target blob', t => {
  const { repo, base } = fixture(t, { legacy: true });
  put(repo, 'SPEC.md', syntheticStory); rmSync(join(repo, 'USER_STORIES.md')); symlinkSync('SPEC.md', join(repo, 'USER_STORIES.md'));
  const head = commit(repo);
  assert.equal(git(repo, 'show', `${head}:USER_STORIES.md`), 'SPEC.md');
  assert.throws(() => parseStories(git(repo, 'show', `${head}:USER_STORIES.md`)), /no ## US-XXX/);
  assert.equal(storiesAt(repo, head)[0].id, 'US-001');
  assert.equal(storiesAt(repo, base)[0].id, 'US-001');
  const receipt = syntheticReceipt(repo);
  assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--all').status, 0);
  receipt.value.stories[0].id = 'US-999'; receipt.save();
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all').value.errors.join('\n'), /not a story at HEAD/);
});

test('malformed canonical SPEC never falls back to a valid legacy file', t => {
  const { repo } = fixture(t, { legacy: true });
  put(repo, 'SPEC.md', 'Not a spec'); commit(repo);
  assert.throws(() => storiesAt(repo, 'HEAD'), /no ## US-XXX/);
  assert.equal(cli(repo, 'check').status, 1);
});

test('missing SPEC and symlinked SPEC fail working and immutable readers', t => {
  const { repo } = fixture(t);
  rmSync(join(repo, 'SPEC.md')); commit(repo);
  assert.equal(cli(repo, 'check').status, 1);
  assert.throws(() => storiesAt(repo, 'HEAD'), /missing SPEC/);
  put(repo, 'hidden.md', syntheticStory); symlinkSync('hidden.md', join(repo, 'SPEC.md')); commit(repo);
  assert.equal(cli(repo, 'check').status, 1);
  assert.throws(() => storiesAt(repo, 'HEAD'), /regular file/);
  assert.throws(() => storiesAt(repo, 'invalid-revision'), /Command failed/);
});

for (const [name, contents, error] of [
  ['no headings', '# empty', /no ## US-XXX/],
  ['duplicate IDs', syntheticStory + syntheticStory, /duplicate US-001/],
  ['no statement', syntheticStory.replace('Statement:', 'Intent:'), /missing Statement/],
  ['empty statement', syntheticStory.replace('Statement: Save a synthetic image.', 'Statement:'), /missing Statement/],
  ['malformed heading among valid stories', syntheticStory + '\n## US-9999 Malformed\n', /malformed/],
  ['no criterion', syntheticStory.replace('1. THE SYSTEM SHALL save the synthetic bytes.', ''), /criteria/],
  ['no SHALL', syntheticStory.replace('SHALL', 'may'), /SHALL/],
  ['nonconsecutive criteria', syntheticStory.replace('1.', '2.'), /consecutive/],
  ['unfinished story', syntheticStory + 'TODO: finish\n', /TODO/],
  ['unknown supersede target', syntheticStory + 'Superseded by US-999\n', /does not resolve/],
]) test(`format validator refuses ${name}`, () => assert.throws(() => parseStories(contents), error));

test('check retains document, map, tracked source and verification-procedure guards', t => {
  const { repo } = fixture(t);
  assert.equal(cli(repo, 'check').status, 0);
  rmSync(join(repo, 'DESIGN.md')); put(repo, 'features/test.md', 'Stories: US-999\nSource: absent/**\n');
  rmSync(join(repo, '.agents/skills/test/SKILL.md')); commit(repo);
  const errors = cli(repo, 'check').value.errors.join('\n');
  assert.match(errors, /missing DESIGN/); assert.match(errors, /not a live story/);
  assert.match(errors, /matches no tracked files/); assert.match(errors, /missing ## Driving it/); assert.match(errors, /missing verify skill/);
});

test('canonical-only changes and mapped source changes select stories; unrelated changes do not', t => {
  const { repo, base } = fixture(t);
  put(repo, 'unrelated.txt', 'unrelated'); commit(repo);
  assert.deepEqual(cli(repo, 'affected', '--base', base).value.stories, []);
  const unrelatedHead = git(repo, 'rev-parse', 'HEAD');
  put(repo, 'SPEC.md', syntheticStory + '\nAdditional behavior.\n'); commit(repo);
  assert.deepEqual(cli(repo, 'affected', '--base', unrelatedHead).value.stories, ['US-001']);
  const specHead = git(repo, 'rev-parse', 'HEAD');
  put(repo, 'capture.mjs', '// changed capture\n'); commit(repo);
  assert.deepEqual(cli(repo, 'affected', '--base', specHead).value.stories, ['US-001']);
});

test('receipt accepts concrete hashed fixture and refuses every evidence/binding corruption', t => {
  const { repo } = fixture(t);
  const { value, save } = syntheticReceipt(repo);
  assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--all').status, 0);
  const original = structuredClone(value);
  const mutations = [
    v => { v.head = '0'.repeat(40); }, v => { v.tree = '0'.repeat(40); }, v => { v.exit = 1; },
    v => { v.stories[0].criteria = []; }, v => { v.stories[0].criteria[0].n = 2; },
    v => { v.stories[0].criteria[0].evidence = []; }, v => { v.stories[0].criteria[0].status = 'fail'; },
    v => { v.stories[0].criteria[0].evidence = ['unlisted.txt']; }, v => { v.stories = []; },
    v => { v.stories.push(structuredClone(v.stories[0])); }, v => { v.artifacts.push(structuredClone(v.artifacts[0])); },
    v => { v.artifacts[0].path = '../escape'; }, v => { v.artifacts[0].sha256 = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    Object.assign(value, structuredClone(original)); mutate(value); save();
    assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--all').status, 1);
  }
  Object.assign(value, original); save(); put(repo, 'output/evidence.txt', 'altered');
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all').value.errors.join('\n'), /digest mismatch/);
  rmSync(join(repo, 'output/evidence.txt'));
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all').value.errors.join('\n'), /missing or digest/);
});

test('change receipts bind requested base and require affected stories', t => {
  const { repo, base } = fixture(t);
  put(repo, 'capture.mjs', '// changed\n'); commit(repo);
  const { value, save } = syntheticReceipt(repo);
  value.base = base; save();
  assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--base', base).status, 0);
  value.base = '0'.repeat(40); save();
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--base', base).value.errors.join('\n'), /base differs/);
  value.base = base; value.stories = []; save();
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--base', base).value.errors.join('\n'), /affected US-001 is missing/);
});

test('baseline ratchet preserves historical foundation base and demands an extension record', t => {
  const { repo, base } = fixture(t, { legacy: true });
  rmSync(join(repo, 'USER_STORIES.md')); put(repo, 'SPEC.md', syntheticStory);
  baseline(repo, [{ gap: 'walk:US-001', owner: 'synthetic', expires: dateAfter(2) }]); commit(repo);
  assert.match(cli(repo, 'check', '--base', base).value.errors.join('\n'), /add a foundation\/extensions/);
  addExtension(repo);
  assert.equal(cli(repo, 'check', '--base', base).status, 0);
  baseline(repo, [{ gap: 'walk:US-001', owner: 'synthetic', expires: dateAfter(-1) }]); commit(repo);
  assert.match(cli(repo, 'check', '--base', base).value.errors.join('\n'), /expired/);
  baseline(repo, [{ gap: 'walk:US-001', owner: 'synthetic', expires: dateAfter(31) }]); commit(repo);
  assert.match(cli(repo, 'check', '--base', base).value.errors.join('\n'), /more than 30/);
});

test('unwalked baseline only excuses provably unaffected mapped stories; passed gaps must be removed', t => {
  const { repo } = fixture(t);
  baseline(repo, [{ gap: 'walk:US-001', owner: 'synthetic', expires: dateAfter(2) }]); const base = commit(repo);
  put(repo, 'unrelated.txt', 'unrelated'); commit(repo);
  const { value, save } = syntheticReceipt(repo);
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all').value.errors.join('\n'), /remove baseline walk/);
  value.base = base; value.stories[0] = { id: 'US-001', status: 'unwalked' }; save();
  assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--all', '--base', base).status, 0);
  assert.equal(cli(repo, 'receipt', 'output/receipt.json', '--all').status, 1);
  put(repo, 'capture.mjs', '// affected\n'); commit(repo);
  value.head = git(repo, 'rev-parse', 'HEAD'); value.tree = git(repo, 'rev-parse', 'HEAD^{tree}'); save();
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all', '--base', base).value.errors.join('\n'), /affected and must be walked/);
  put(repo, 'features/test.md', 'Stories: \nSource: capture.mjs\n'); commit(repo);
  value.head = git(repo, 'rev-parse', 'HEAD'); value.tree = git(repo, 'rev-parse', 'HEAD^{tree}'); save();
  assert.match(cli(repo, 'receipt', 'output/receipt.json', '--all', '--base', base).value.errors.join('\n'), /unwalked but unmapped/);
});

test('canonical migration is not a first-story trigger; first SPEC stories require exact designated approval', async t => {
  const migrated = fixture(t, { legacy: true });
  rmSync(join(migrated.repo, 'USER_STORIES.md')); put(migrated.repo, 'SPEC.md', syntheticStory); const migratedHead = commit(migrated.repo);
  assert.deepEqual((await reviewProbe(t, migrated.repo, migrated.base, migratedHead, [])).value.reasons, []);
  const { repo, base } = fixture(t, { empty: true });
  put(repo, 'SPEC.md', syntheticStory); const head = commit(repo);
  assert.equal((await reviewProbe(t, repo, base, head, [])).status, 1);
  assert.equal((await reviewProbe(t, repo, base, head, [approval(base)])).status, 1);
  assert.equal((await reviewProbe(t, repo, base, head, [approval(head, 'APPROVED', '', 'operator')])).status, 1);
  assert.equal((await reviewProbe(t, repo, base, head, [approval(head)])).status, 0);
  assert.equal((await reviewProbe(t, repo, base, head, [approval(head)], 'kaylee-agent[bot]')).status, 1);
});

test('extension review refuses stale, dismissed and superseded approvals; paginates', async t => {
  const { repo, base } = fixture(t); const head = addExtension(repo);
  for (const reviews of [[], [approval(base)], [approval(head), approval(head, 'DISMISSED')], [approval(head), approval(head, 'CHANGES_REQUESTED')]]) {
    assert.equal((await reviewProbe(t, repo, base, head, reviews)).status, 1);
  }
  assert.equal((await reviewProbe(t, repo, base, head, [approval(head)])).status, 0);
  const reviews = Array.from({ length: 100 }, () => approval(head, 'COMMENTED', '', 'other'));
  reviews.push(approval(head)); assert.equal((await reviewProbe(t, repo, base, head, reviews)).status, 0);
});

test('escalation requires a later exact-head approval with literal resolution opening', async t => {
  const { repo, base } = fixture(t); const head = addExtension(repo);
  const escalated = approval(head, 'COMMENTED', 'foundation-escalation: product-direction');
  for (const body of ['', '> foundation-escalation: resolved', 'quoted\nfoundation-escalation: resolved']) {
    assert.equal((await reviewProbe(t, repo, base, head, [escalated, approval(head, 'APPROVED', body)])).status, 1);
  }
  assert.equal((await reviewProbe(t, repo, base, head, [escalated, approval(head, 'APPROVED', 'foundation-escalation: resolved\nSynthetic decision')])).status, 0);
});

test('trusted checker treats malicious candidate scripts as data, not executable code', async t => {
  const { repo, base } = fixture(t); const marker = join(repo, 'should-not-exist');
  put(repo, 'qa/spec-check.mjs', `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'executed'); process.exit(0);`);
  const head = addExtension(repo);
  assert.equal((await reviewProbe(t, repo, base, head, [])).status, 1);
  assert.throws(() => readFileSync(marker), /ENOENT/);
});
