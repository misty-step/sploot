#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const POLICY_FILES = {
  'scripts/check-provider-retirement.mjs': true,
  'scripts/check-provider-retirement.test.mjs': true,
};

const HISTORICAL_PATHS = [
  /^CHANGELOG\.md$/,
  /^docs\/adr\//,
  /^docs\/qa\//,
  /^docs\/auth-agent-readiness-decision-/,
  /^docs\/auth-agent-readiness-plan-/,
  /^explorations\//,
  /^\.evidence\//,
  /^\.spellbook\/tailor\/audit\//,
  /^apps\/extension\/ARCHITECTURE\.md$/,
  /^apps\/extension\/STORE_LISTING\.md$/,
  /^apps\/web\/docs\/adr\//,
  /^apps\/web\/docs\/NEON_BRANCH_CLEANUP_SUMMARY\.md$/,
  /^apps\/web\/docs\/deployed-smoke-report\.json$/,
  /^apps\/web\/public\/screenshots\/capture-manifest\.json$/,
];

const FORBIDDEN_PATHS = [
  { rule: 'compute manifest', pattern: /(^|\/)vercel\.json$/i },
  { rule: 'local compute link', pattern: /(^|\/)\.vercel(\/|$)/i },
  { rule: 'provider-branded runtime module', pattern: /(^|\/)vercel-(?!blob)[^/]*\.(?:ts|tsx|js|mjs)$/i },
  { rule: 'provider compute asset', pattern: /(^|\/)vercel\.svg$/i },
  { rule: 'retired Canary integration artifact', pattern: /(^|\/)\.canary(\/|$)/i },
];

const FORBIDDEN_CONTENT = [
  {
    rule: 'non-Blob Vercel package',
    pattern: /@vercel\/(?!blob(?=$|[^a-z0-9._-]))[a-z0-9._-]+/i,
  },
  { rule: 'Upstash runtime package', pattern: /@upstash\/redis/i },
  { rule: 'Vercel runtime environment', pattern: /\bVERCEL_[A-Z0-9_]+\b/ },
  { rule: 'retired cache environment', pattern: /\b(?:KV_REST_API|UPSTASH_REDIS)[A-Z0-9_]*\b/ },
  { rule: 'Vercel compute URL', pattern: /https?:\/\/[^\s/"'`]+\.vercel\.app\b/i },
  {
    rule: 'Vercel compute CLI',
    pattern: /(?<![@./\w-])vercel(?=\s*(?:$|--[a-z]|(?:build|deploy|dev|env|inspect|link|list|logs|promote|pull|redeploy|remove|rollback|switch|whoami)\b))/,
  },
  {
    rule: 'Vercel compute doctrine',
    pattern: /\bVercel(?:-first|\s+(?:hosting|deployments?|compute|serverless|functions?|analytics|speed insights|KV|runtime|release posture|web deploy|production environment|dashboard))\b/i,
  },
  { rule: 'retired Canary environment', pattern: /\b(?:[A-Z0-9_]*CANARY_[A-Z0-9_]+)\b/ },
  { rule: 'retired Canary reporter', pattern: /canary-reporter/i },
  {
    rule: 'retired Canary endpoint',
    pattern: /(?:canary\.mistystep\.io|canary-obs\.fly\.dev)/i,
  },
  { rule: 'retired Canary ownership header', pattern: /X-Sploot-Canary-Owner/i },
];

export function isHistoricalPath(file) {
  return HISTORICAL_PATHS.some((pattern) => pattern.test(file));
}

export function findProviderRetirementViolations(files) {
  const violations = [];

  for (const { path, content } of files) {
    if (POLICY_FILES[path] || isHistoricalPath(path)) continue;

    for (const { rule, pattern } of FORBIDDEN_PATHS) {
      if (pattern.test(path)) {
        violations.push({ path, line: 1, rule });
      }
    }

    for (const [index, line] of content.split('\n').entries()) {
      for (const { rule, pattern } of FORBIDDEN_CONTENT) {
        if (pattern.test(line)) {
          violations.push({ path, line: index + 1, rule });
        }
      }
    }
  }

  return violations;
}

export function findIgnoredEnvironmentViolations(files) {
  const violations = [];

  for (const { path, content } of files) {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const match = line.match(
        /^\s*(?:export\s+)?(VERCEL_[A-Z0-9_]+|[A-Z0-9_]*CANARY_[A-Z0-9_]+)\s*=/,
      );
      if (!match) continue;

      violations.push({
        path,
        line: index + 1,
        rule: match[1].includes('CANARY')
          ? 'retired Canary environment'
          : 'Vercel runtime environment',
        identifier: match[1],
      });
    }
  }

  return violations;
}

export function formatProviderRetirementViolation(violation) {
  const identifier = violation.identifier ? ` (${violation.identifier})` : '';
  return `- ${violation.path}:${violation.line} ${violation.rule}${identifier}`;
}

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' }
  );

  return output
    .split('\0')
    .filter(Boolean)
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

function ignoredEnvironmentFiles() {
  const output = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '-z',
      '--',
      ':(glob)**/.env',
      ':(glob)**/.env.*',
    ],
    { encoding: 'utf8' }
  );

  return output
    .split('\0')
    .filter(Boolean)
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

function main() {
  const violations = [
    ...findProviderRetirementViolations(repositoryFiles()),
    ...findIgnoredEnvironmentViolations(ignoredEnvironmentFiles()),
  ];
  if (violations.length === 0) {
    console.log('provider retirement check passed (retired Vercel compute and Canary surfaces absent)');
    return;
  }

  console.error('provider retirement check failed:');
  for (const violation of violations) {
    console.error(formatProviderRetirementViolation(violation));
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
