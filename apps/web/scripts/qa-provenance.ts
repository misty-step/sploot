#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

type DigestEntry = {
  path: string;
  kind: 'file' | 'symlink' | 'deleted';
  mode: string;
  target?: string;
  bytes: string;
};

export type QaProvenanceManifest = {
  version: 1;
  generatedAt: string;
  base: { commit: string; tree: string };
  sourceFiles: DigestEntry[];
  sourceDigest: string;
  artifactRoot: string;
  artifactFiles: DigestEntry[];
  artifactDigest: string;
};

const GENERATED_PREFIXES = [
  '.git/',
  'node_modules/',
  '.next/',
  'test-results/',
  'coverage/',
  '.turbo/',
  'dist/',
  'build/',
];
const GENERATED_FILES = new Set([
  'apps/web/public/sw.js',
]);
const MUTABLE_ARTIFACT_PREFIXES = ['.next/cache/'];

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalDigest(entries: DigestEntry[]): string {
  if (entries.length === 0) throw new Error('provenance digest input is empty');
  return sha256(JSON.stringify(entries));
}

function entryFor(root: string, path: string): DigestEntry {
  const absolute = join(root, path);
  try {
    const stat = lstatSync(absolute);
    const mode = (stat.mode & 0o7777).toString(8);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      return { path, kind: 'symlink', mode, target, bytes: sha256(`symlink:${target}`) };
    }
    if (!stat.isFile()) throw new Error(`provenance input is not a regular file: ${path}`);
    return { path, kind: 'file', mode, bytes: sha256(readFileSync(absolute)) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path, kind: 'deleted', mode: '0', bytes: sha256('deleted') };
    }
    throw error;
  }
}

export function digestPaths(root: string, paths: string[]): { files: DigestEntry[]; digest: string } {
  const files = [...new Set(paths)].sort().map((path) => entryFor(root, path));
  return { files, digest: canonicalDigest(files) };
}

export function digestDirectory(root: string): { files: DigestEntry[]; digest: string } {
  const paths: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const absolute = join(directory, name);
      const path = relative(root, absolute).split('\\').join('/');
      if (MUTABLE_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else paths.push(path);
    }
  };
  visit(root);
  return digestPaths(root, paths);
}

function gitPaths(repositoryRoot: string, command: string): string[] {
  const output = execFileSync('git', command.split(' '), { cwd: repositoryRoot, encoding: 'buffer' });
  return output.toString().split('\0').filter(Boolean);
}

export function buildRelevantSourcePaths(repositoryRoot: string): string[] {
  const paths = [
    ...gitPaths(repositoryRoot, 'diff --name-only -z HEAD'),
    ...gitPaths(repositoryRoot, 'ls-files --others --exclude-standard -z'),
  ];
  return [...new Set(paths)].filter((path) =>
    !GENERATED_PREFIXES.some((prefix) => path.startsWith(prefix)) && !GENERATED_FILES.has(path)
  );
}

export function canonicalStandaloneRoot(repositoryRoot: string): string {
  return resolve(repositoryRoot, 'apps/web/.next/standalone/apps/web');
}

function sortedPaths(entries: DigestEntry[]): string[] {
  return entries.map((entry) => entry.path).sort();
}

export function assertExactDigestPaths(
  label: string,
  expectedPaths: string[],
  actualEntries: DigestEntry[],
): void {
  const expected = [...new Set(expectedPaths)].sort();
  const actual = sortedPaths(actualEntries);
  if (actual.length !== new Set(actual).size || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} path set does not match independently derived build input`);
  }
}

export function assertExactDigestEntries(
  label: string,
  expected: DigestEntry[],
  actual: DigestEntry[],
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} digest entries changed since build`);
  }
}

export function assertCanonicalArtifactRoot(repositoryRoot: string, manifestRoot: string): string {
  const repositoryReal = realpathSync(repositoryRoot);
  const canonical = canonicalStandaloneRoot(repositoryRoot);
  const requested = resolve(repositoryRoot, manifestRoot);
  if (manifestRoot !== 'apps/web/.next/standalone/apps/web' || isAbsolute(manifestRoot)) {
    throw new Error('provenance artifactRoot is not the canonical standalone root');
  }
  const canonicalReal = realpathSync(canonical);
  const requestedReal = realpathSync(requested);
  const contained = relative(repositoryReal, requestedReal);
  if (requestedReal !== canonicalReal || contained.startsWith('..') || isAbsolute(contained)) {
    throw new Error('provenance artifactRoot is outside the canonical repository artifact');
  }
  return canonicalReal;
}

function baseIdentity(repositoryRoot: string): { commit: string; tree: string } {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  return { commit, tree };
}

export function createQaProvenanceManifest(
  repositoryRoot: string,
  artifactRoot: string,
): QaProvenanceManifest {
  const canonicalRoot = canonicalStandaloneRoot(repositoryRoot);
  if (resolve(artifactRoot) !== resolve(canonicalRoot)) {
    throw new Error('provenance build artifact must be the canonical standalone root');
  }
  const sourceFiles = digestPaths(repositoryRoot, buildRelevantSourcePaths(repositoryRoot));
  const artifactFiles = digestDirectory(artifactRoot);
  if (sourceFiles.files.length === 0 || artifactFiles.files.length === 0) {
    throw new Error('provenance requires nonempty source and built-artifact inputs');
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    base: baseIdentity(repositoryRoot),
    sourceFiles: sourceFiles.files,
    sourceDigest: sourceFiles.digest,
    artifactRoot: relative(repositoryRoot, canonicalRoot).split('\\').join('/'),
    artifactFiles: artifactFiles.files,
    artifactDigest: artifactFiles.digest,
  };
}

export function verifyQaProvenanceManifest(
  repositoryRoot: string,
  manifest: QaProvenanceManifest,
): void {
  if (!manifest.sourceFiles.length || !manifest.artifactFiles.length || !manifest.sourceDigest || !manifest.artifactDigest) {
    throw new Error('provenance manifest has empty digest input');
  }
  const currentBase = baseIdentity(repositoryRoot);
  if (JSON.stringify(currentBase) !== JSON.stringify(manifest.base)) {
    throw new Error('base commit/tree changed since build');
  }
  const expectedSourcePaths = buildRelevantSourcePaths(repositoryRoot);
  assertExactDigestPaths('source', expectedSourcePaths, manifest.sourceFiles);
  const source = digestPaths(repositoryRoot, expectedSourcePaths);
  if (source.digest !== manifest.sourceDigest) {
    throw new Error('modified/untracked source changed since build');
  }
  assertExactDigestEntries('source', source.files, manifest.sourceFiles);
  const artifactRoot = assertCanonicalArtifactRoot(repositoryRoot, manifest.artifactRoot);
  const artifact = digestDirectory(artifactRoot);
  assertExactDigestPaths('artifact', artifact.files.map((entry) => entry.path), manifest.artifactFiles);
  if (artifact.digest !== manifest.artifactDigest) {
    throw new Error('built artifact changed since build');
  }
  assertExactDigestEntries('artifact', artifact.files, manifest.artifactFiles);
}

if (process.argv[1]?.endsWith('qa-provenance.ts')) {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const output = resolve(process.cwd(), process.argv[2] ?? '.next/qa-provenance.json');
  const artifactRoot = resolve(process.cwd(), process.argv[3] ?? '.next/standalone/apps/web');
  const manifest = createQaProvenanceManifest(repositoryRoot, artifactRoot);
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${relative(repositoryRoot, output)} source=${manifest.sourceDigest} artifact=${manifest.artifactDigest}`);
}
