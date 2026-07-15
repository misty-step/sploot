import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const liveKeyPattern = /(?:sk|rk)_live_[A-Za-z0-9]{8,}/g;
const trackedFiles = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];

for (const file of trackedFiles) {
  let contents;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const match of contents.matchAll(liveKeyPattern)) {
    findings.push(`${file}:${match.index}`);
  }
}

if (findings.length > 0) {
  console.error('Stripe sandbox check failed: live-looking Stripe keys found in tracked files.');
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log(`Stripe sandbox check passed: scanned ${trackedFiles.length} tracked files; no live-looking key found.`);
