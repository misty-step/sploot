import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import ts from 'typescript';

const PUBLIC_ROUTES = new Set([
  'app/api/assets/route.ts',
  'app/api/assets/[id]/route.ts',
  'app/api/assets/[id]/similar/route.ts',
  'app/api/search/route.ts',
  'app/api/search/advanced/route.ts',
  'app/api/upload/route.ts',
  'app/api/upload/url/route.ts',
  'app/api/upload/check/route.ts',
  'app/api/tags/route.ts',
  'app/api/tags/[tagId]/route.ts',
]);

const INTERNAL_ROUTES = new Set([
  'app/api/analytics/usage/route.ts', 'app/api/assets/[id]/embedding-status/route.ts',
  'app/api/assets/[id]/generate-embedding/route.ts', 'app/api/assets/[id]/share/route.ts',
  'app/api/assets/[id]/tags/route.ts', 'app/api/assets/audit/route.ts',
  'app/api/assets/batch/embedding-status/route.ts', 'app/api/cache/stats/route.ts',
  'app/api/cron/audit-assets/route.ts', 'app/api/cron/process-embeddings/route.ts',
  'app/api/cron/purge-deleted-assets/route.ts', 'app/api/cron/purge-search-logs/route.ts',
  'app/api/cron/regenerate-thumbnails/route.ts', 'app/api/db-ping/route.ts',
  'app/api/embeddings/image/route.ts', 'app/api/embeddings/text/route.ts',
  'app/api/health/route.ts', 'app/api/health/services/route.ts',
  'app/api/health/user-sync/route.ts', 'app/api/library/starter/route.ts',
  'app/api/piles/route.ts', 'app/api/qa-auth/login/route.ts',
  'app/api/sse/embedding-updates/route.ts', 'app/api/stats/route.ts',
  'app/api/taste/profile/route.ts', 'app/api/telemetry/route.ts',
  'app/api/upload-tokens/[id]/route.ts', 'app/api/upload-tokens/route.ts',
  'app/api/version/route.ts',
]);

const PRIVATE_RESPONSE_KEYS = new Set([
  'embedding', 'embeddingError', 'embeddingVector', 'image_embedding', 'ownerUserId',
  'modelName', 'modelVersion', 'dim', 'updatedAt', 'retryCount', 'storageProvider',
  'provider', 'billing', 'provenance', 'completedAt', 'embeddingCreatedAt',
]);

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

export function analyzeTypeScriptSource(source, fileName = 'inventory.ts') {
  const file = parse(source, fileName);
  const calls = new Map();
  const importedNames = new Set();
  const responseSites = [];
  let publicUploadMapperCalls = 0;
  let assetPropertyInitializers = 0;
  let assetPropertyMapperCalls = 0;

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const element of node.importClause.namedBindings.elements) importedNames.add(element.name.text);
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) calls.set(node.expression.text, (calls.get(node.expression.text) ?? 0) + 1);
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'NextResponse' && node.expression.name.text === 'json') {
        const argument = node.arguments[0];
        responseSites.push({ node, argument, text: argument ? argument.getText(file) : '' });
      }
      if (ts.isIdentifier(node.expression) && ['normalizeAssetToGridDto', 'normalizeAssetToPublicDto', 'createSplootApiSearchResult', 'toPublicUploadAsset'].includes(node.expression.text)) {
        publicUploadMapperCalls += 1;
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'asset') {
      assetPropertyInitializers += 1;
      if (ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) &&
          ['normalizeAssetToGridDto', 'normalizeAssetToPublicDto', 'toPublicSearchResult', 'toPublicUploadAsset'].includes(node.initializer.expression.text)) assetPropertyMapperCalls += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { calls, importedNames, responseCalls: responseSites.length, responseSites,
    publicUploadMapperCalls, assetPropertyInitializers, assetPropertyMapperCalls };
}

export function inspectRouteSource(source, fileName, classification = 'public') {
  const analysis = analyzeTypeScriptSource(source, fileName);
  const failures = [];
  if (!['public', 'internal'].includes(classification)) failures.push(`${fileName}: invalid route classification`);
  if (classification === 'public') {
    for (const site of analysis.responseSites) {
      if (!site.argument) { failures.push(`${fileName}: empty response body`); continue; }
      if (ts.isIdentifier(site.argument) && ['asset', 'result', 'data', 'row'].includes(site.argument.text)) {
        failures.push(`${fileName}: raw/untyped ${site.argument.text} response at ${site.node.getStart()}`);
      }
      for (const key of PRIVATE_RESPONSE_KEYS) {
        if (new RegExp(`(?:[.{, ]|^)["']?${key}["']?\\s*:`).test(site.text)) {
          failures.push(`${fileName}: private field ${key} reaches a public response at ${site.node.getStart()}`);
        }
      }
    }
  }
  return { classification, failures, analysis };
}

async function routeFiles(root) {
  const result = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === 'route.ts') result.push(path);
    }
  }
  await walk(resolve(root, 'app/api'));
  return result.sort();
}

export async function inspectAssetGridInventory(webRoot) {
  const failures = [];
  const reports = [];
  const files = await routeFiles(webRoot);
  const known = new Set([...PUBLIC_ROUTES, ...INTERNAL_ROUTES]);
  for (const file of files) {
    const fileName = relative(webRoot, file).split(sep).join('/');
    if (!known.has(fileName)) { failures.push(`${fileName}: route has no explicit public/internal classification`); continue; }
    const classification = PUBLIC_ROUTES.has(fileName) ? 'public' : 'internal';
    const result = inspectRouteSource(await readFile(file, 'utf8'), fileName, classification);
    failures.push(...result.failures);
    reports.push({ file: fileName, classification, responseCalls: result.analysis.responseCalls,
      mapperCalls: (result.analysis.calls.get('normalizeAssetToGridDto') ?? 0)
        + (result.analysis.calls.get('normalizeAssetToPublicDto') ?? 0)
        + (result.analysis.calls.get('createSplootApiSearchResult') ?? 0)
        + (result.analysis.calls.get('toPublicSearchResult') ?? 0)
        + (result.analysis.calls.get('toPublicUploadAsset') ?? 0) });
  }

  for (const fileName of ['app/api/assets/route.ts', 'app/api/search/route.ts', 'app/api/assets/[id]/similar/route.ts', 'app/api/search/advanced/route.ts', 'app/api/assets/[id]/route.ts']) {
      const report = reports.find((item) => item.file === fileName);
    if (!report || report.mapperCalls < 1) failures.push(`${fileName}: canonical public mapper call missing`);
  }
  for (const fileName of ['app/api/upload/route.ts', 'app/api/upload/url/route.ts']) {
    const analysis = analyzeTypeScriptSource(await readFile(resolve(webRoot, fileName), 'utf8'), fileName);
    if (analysis.publicUploadMapperCalls < 1) failures.push(`${fileName}: executable public-upload mapper branch missing`);
    if (analysis.assetPropertyInitializers !== analysis.assetPropertyMapperCalls) failures.push(`${fileName}: asset response property bypasses canonical mapper`);
  }
  const advanced = analyzeTypeScriptSource(await readFile(resolve(webRoot, 'app/api/search/advanced/route.ts'), 'utf8'), 'app/api/search/advanced/route.ts');
  if (!advanced.importedNames.has('executeAdvancedSearchQuery')) failures.push('advanced route: production query module import missing');
  if (advanced.calls.has('$queryRaw')) failures.push('advanced route: raw SQL remains embedded in route');
  return { failures, reports };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await inspectAssetGridInventory(resolve(import.meta.dirname, '..'));
  if (result.failures.length) {
    console.error('Asset grid DTO inventory gate failed:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Asset grid AST inventory gate passed for ${result.reports.length} classified routes and ${result.reports.reduce((n, report) => n + report.responseCalls, 0)} response sites.`);
  }
}
