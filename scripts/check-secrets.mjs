#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const PLACEHOLDER_VALUES = new Set([
  '',
  '...',
  '<password>',
  '<token>',
  'changeme',
  'example',
  'mock',
  'pass',
  'password',
  'placeholder',
  'postgres',
  'test',
  'token',
  'user',
  'username',
  'your_password',
  'your_token',
]);

const SECRET_ENV_NAMES = [
  'BLOB_READ_WRITE_TOKEN',
  'CLERK_SECRET_KEY',
  'DATABASE_URL',
  'DATABASE_URL_DIRECT',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'REPLICATE_API_TOKEN',
  'UPSTASH_REDIS_REST_TOKEN',
];

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function expandInput(inputPath) {
  if (!existsSync(inputPath)) {
    return [];
  }

  const stats = statSync(inputPath);
  if (stats.isFile()) {
    return [inputPath];
  }
  if (!stats.isDirectory()) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(inputPath)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    files.push(...expandInput(path.join(inputPath, entry)));
  }
  return files;
}

function isLikelyPlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized)) {
    return true;
  }
  const strippedPrefixes = normalized
    .replace(/^sk_(test|live)_/, '')
    .replace(/^pk_(test|live)_/, '')
    .replace(/^vercel_blob_/, '')
    .replace(/^r8_/, '');

  return (
    normalized.startsWith('your_') ||
    normalized.startsWith('<') ||
    normalized.includes('example') ||
    normalized.includes('your_') ||
    /^x+$/.test(strippedPrefixes)
  );
}

function redactUrl(rawValue) {
  return rawValue.replace(/(postgres(?:ql)?:\/\/)([^:@\s]+)(?::([^@\s]*))?@/gi, '$1$2:[REDACTED]@');
}

function isRealNeonPostgresUrl(rawValue) {
  const cleaned = rawValue.trim().replace(/^['"`]|['"`]$/g, '');
  if (!/^postgres(?:ql)?:\/\//i.test(cleaned)) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    return /neon\.tech/i.test(cleaned) && !/(user|password|your_|example|<)/i.test(cleaned);
  }

  if (!parsed.hostname.endsWith('.neon.tech')) {
    return false;
  }

  return !isLikelyPlaceholder(parsed.username) || !isLikelyPlaceholder(parsed.password);
}

function isRealTokenAssignment(name, rawValue) {
  const value = rawValue.trim().replace(/^['"`]|['"`]$/g, '');
  if (isLikelyPlaceholder(value)) {
    return false;
  }

  if (name === 'DATABASE_URL' || name === 'DATABASE_URL_DIRECT' || name.startsWith('POSTGRES_URL')) {
    return isRealNeonPostgresUrl(value);
  }

  if (name === 'CLERK_SECRET_KEY') {
    return /^sk_(test|live)_[A-Za-z0-9_-]{12,}$/.test(value);
  }
  if (name === 'REPLICATE_API_TOKEN') {
    return /^r8_[A-Za-z0-9]{12,}$/.test(value);
  }
  if (name === 'BLOB_READ_WRITE_TOKEN') {
    return /^vercel_blob_[A-Za-z0-9_-]{12,}$/.test(value);
  }
  if (name === 'UPSTASH_REDIS_REST_TOKEN') {
    return value.length >= 20 && /^[A-Za-z0-9_./+=:-]+$/.test(value);
  }

  return false;
}

function scanLine(file, lineNumber, line) {
  const findings = [];

  const postgresUrls = line.match(/postgres(?:ql)?:\/\/[^\s'"`<>]+/gi) ?? [];
  for (const value of postgresUrls) {
    if (isRealNeonPostgresUrl(value)) {
      findings.push({
        file,
        line: lineNumber,
        rule: 'real-neon-postgres-url',
        evidence: redactUrl(value),
      });
    }
  }

  const assignmentPattern = new RegExp(`\\b(${SECRET_ENV_NAMES.join('|')})\\s*[:=]\\s*([^\\s#]+)`, 'g');
  for (const match of line.matchAll(assignmentPattern)) {
    const [, name, value] = match;
    if (isRealTokenAssignment(name, value)) {
      findings.push({
        file,
        line: lineNumber,
        rule: `real-secret-assignment:${name}`,
        evidence: name.includes('URL') || name.startsWith('POSTGRES') ? redactUrl(`${name}=${value}`) : `${name}=[REDACTED]`,
      });
    }
  }

  return findings;
}

function scanContents(file, contents) {
  if (contents.includes('\0')) {
    return [];
  }

  return contents
    .split(/\r?\n/)
    .flatMap((line, index) => scanLine(file, index + 1, line));
}

function scanFile(file) {
  try {
    return scanContents(file, readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function filesChangedInCommit(commit) {
  const output = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit], {
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

function gitBlobExists(commit, file) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}:${file}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function scanGitRange(range) {
  const commits = execFileSync('git', ['rev-list', '--reverse', range], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const findings = [];

  for (const commit of commits) {
    for (const file of filesChangedInCommit(commit)) {
      if (!gitBlobExists(commit, file)) {
        continue;
      }
      let contents;
      try {
        contents = execFileSync('git', ['show', `${commit}:${file}`], { encoding: 'utf8' });
      } catch {
        continue;
      }
      findings.push(...scanContents(`${commit.slice(0, 12)}:${file}`, contents));
    }
  }

  return { checked: commits.length, findings };
}

const args = process.argv.slice(2);
const gitRangeIndex = args.indexOf('--git-range');
const gitRange = gitRangeIndex >= 0 ? args[gitRangeIndex + 1] : undefined;

let checkedCount;
let findings;

if (gitRange) {
  const result = scanGitRange(gitRange);
  checkedCount = result.checked;
  findings = result.findings;
} else {
  const inputArgs =
    gitRangeIndex >= 0 ? args.filter((arg, index) => index !== gitRangeIndex && index !== gitRangeIndex + 1) : args;
  const files = inputArgs.length > 0 ? inputArgs.flatMap(expandInput) : trackedFiles();
  checkedCount = files.length;
  findings = files.flatMap(scanFile);
}

if (findings.length > 0) {
  console.error('Secret scan failed. Rotate exposed credentials before merging.');
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.rule} ${finding.evidence}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${checkedCount} ${gitRange ? 'commits' : 'files'} checked).`);
