import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeInventory } from './auth-route-inventory.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const appRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const routeFile = /(^|\/)route\.(ts|tsx|js|jsx)$/;
const restrictedModules = new Set([
  '@clerk/nextjs/server',
  '@clerk/backend',
  '@/lib/auth/server',
  '@/lib/auth/verify-bearer',
  '@/lib/auth/request-auth',
]);
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const violations = [];

const files = [...walk(appRoot)]
  .filter(file => routeFile.test(file))
  .map(file => relative(appRoot, file).split('\\').join('/'))
  .sort();

const inventoryFiles = Object.keys(routeInventory).sort();
for (const file of files) {
  if (!routeInventory[file]) violations.push(`${file}: route is not classified in auth-route-inventory`);
}
for (const file of inventoryFiles) {
  if (!files.includes(file)) violations.push(`${file}: inventory entry does not exist`);
}

for (const file of files) {
  const source = readFileSync(join(appRoot, file), 'utf8');
  const entry = routeInventory[file];
  if (!entry) continue;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const exports = exportedMethods(ast);
  const expectedMethods = Object.keys(entry.methods).sort();
  const actualMethods = [...exports.keys()].sort();

  for (const method of actualMethods) {
    if (!httpMethods.has(method)) continue;
    if (!expectedMethods.includes(method)) violations.push(`${file}: unexpected exported method ${method}`);
  }
  for (const method of expectedMethods) {
    if (!exports.has(method)) violations.push(`${file}: missing exported method ${method}`);
  }

  const imports = collectImports(ast);
  for (const restricted of restrictedModules) {
    if (imports.some(item => isRestrictedImport(item.module, restricted, file))) {
      violations.push(`${file}: direct Clerk/legacy auth import ${restricted}`);
    }
  }
  if (imports.some(item => item.module === '@/lib/auth/with-authenticated-api' && item.alias)) {
    violations.push(`${file}: aliased auth boundary import`);
  }
  if (imports.some(item => item.module === 'next/headers' && item.name === 'headers' && item.alias)) {
    violations.push(`${file}: aliased cron header import`);
  }
  if (hasDynamicImport(ast)) violations.push(`${file}: dynamic import in route module`);
  if (hasReexport(ast)) violations.push(`${file}: re-export in route module`);

  const boundaryCalls = findBoundaryCalls(ast);
  const tokenCalls = boundaryCalls.filter(call => call.allowUploadToken);
  const protectedMethods = Object.entries(entry.methods)
    .filter(([, kind]) => kind === 'protected')
    .map(([method]) => method);

  if (protectedMethods.length > 0) {
    if (!imports.some(item => item.module === '@/lib/auth/with-authenticated-api' && item.name === 'withAuthenticatedApi')) {
      violations.push(`${file}: protected route lacks a direct withAuthenticatedApi import`);
    }
    for (const method of protectedMethods) {
      const exported = exports.get(method);
      if (!exported || !resolvesToBoundary(exported, ast, imports)) {
        violations.push(`${file}: ${method} is not wrapped by the real withAuthenticatedApi module`);
      }
    }
  }

  if (tokenCalls.length > 0) {
    if (!entry.tokenMethods?.length || !entry.tokenMethods.some(method => protectedMethods.includes(method))) {
      violations.push(`${file}: allowUploadToken is not declared for an approved token route`);
    }
    if (entry.tokenMethods?.length !== 1 || entry.tokenMethods[0] !== 'POST') {
      violations.push(`${file}: token policy must name exactly POST`);
    }
    if (entry.tokenMethods?.some(method => !protectedMethods.includes(method))) {
      violations.push(`${file}: token policy names a non-protected method`);
    }
    for (const call of tokenCalls) {
      const owningMethods = protectedMethods.filter(method =>
        expressionContainsCall(exports.get(method), call.node, ast)
      );
      const outOfScopeMethods = owningMethods.filter(method => !entry.tokenMethods?.includes(method));
      if (outOfScopeMethods.length > 0) {
        violations.push(`${file}: allowUploadToken policy reaches non-POST method ${outOfScopeMethods.join(', ')}`);
      }
      if (!owningMethods.some(method => entry.tokenMethods?.includes(method))) {
        violations.push(`${file}: allowUploadToken policy is not attached to an approved POST entrypoint`);
      }
    }
  }
  if (entry.tokenMethods?.length && tokenCalls.length === 0) {
    violations.push(`${file}: declared token route has no explicit allowUploadToken policy`);
  }
  if (tokenCalls.length > 0 && !['app/api/upload/route.ts', 'app/api/upload/url/route.ts', 'app/api/search/route.ts'].includes(file)) {
    violations.push(`${file}: allowUploadToken is outside POST upload/upload-url/search`);
  }

  if (Object.values(entry.methods).includes('cron')) {
    if (!hasCronSecretLookup(ast) || !hasHeadersCall(ast) || !imports.some(item => item.module === 'next/headers' && item.name === 'headers')) {
      violations.push(`${file}: cron route lacks explicit CRON_SECRET header authentication`);
    }
    if (!hasUnauthorizedStatus(ast)) violations.push(`${file}: cron route lacks stable unauthorized response`);
  }
}

if (violations.length) {
  console.error('Auth route inventory failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) {
      if (entry === '.next' || entry === 'node_modules') continue;
      yield* walk(file);
    }
    else yield file;
  }
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function collectImports(ast) {
  const imports = [];
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) {
        imports.push({ module: moduleName, name: undefined, alias: false, namespace: false });
      continue;
    }
    if (clause.name) imports.push({ module: moduleName, name: 'default', alias: clause.name.text !== 'default', namespace: false });
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.push({ module: moduleName, name: '*', alias: true, namespace: true });
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        imports.push({ module: moduleName, name: imported, alias: imported !== element.name.text, namespace: false });
      }
    }
  }
  return imports;
}

function exportedMethods(ast) {
  const methods = new Map();
  for (const statement of ast.statements) {
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && httpMethods.has(declaration.name.text)) methods.set(declaration.name.text, declaration.initializer);
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name && httpMethods.has(statement.name.text)) methods.set(statement.name.text, statement);
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exported = element.name.text;
        const local = element.propertyName?.text ?? exported;
        if (httpMethods.has(exported)) methods.set(exported, findDeclaration(ast, local));
      }
    }
  }
  return methods;
}

function hasDynamicImport(ast) {
  let found = false;
  visit(ast, node => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found = true;
  });
  return found;
}

function hasCronSecretLookup(ast) {
  let found = false;
  visit(ast, node => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'CRON_SECRET' &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'env' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'process'
    ) found = true;
  });
  return found;
}

function hasHeadersCall(ast) {
  let found = false;
  visit(ast, node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'headers') found = true;
  });
  return found;
}

function hasUnauthorizedStatus(ast) {
  let found = false;
  visit(ast, node => {
    if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name) || node.name.text !== 'status') return;
    found = found || (node.initializer.kind === ts.SyntaxKind.NumericLiteral && node.initializer.text === '401');
  });
  return found;
}

function hasReexport(ast) {
  return ast.statements.some(statement =>
    (ts.isExportDeclaration(statement) && Boolean(statement.moduleSpecifier)) ||
    (ts.isExportAssignment(statement) && !statement.isExportEquals)
  );
}

function findBoundaryCalls(ast) {
  const calls = [];
  visit(ast, node => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 'withAuthenticatedApi') return;
    const policy = node.arguments[1];
    let allowUploadToken = false;
    if (policy && ts.isObjectLiteralExpression(policy)) {
      if (policy.properties.some(item => ts.isSpreadAssignment(item))) {
        violations.push(`${ast.fileName}: auth policy cannot contain inline spreads`);
      }
      const property = policy.properties.find(item =>
        (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) &&
        item.name && ts.isIdentifier(item.name) && item.name.text === 'allowUploadToken'
      );
      allowUploadToken = Boolean(property && ts.isPropertyAssignment(property) && property.initializer.kind === ts.SyntaxKind.TrueKeyword);
    } else if (policy) {
      violations.push(`${ast.fileName}: auth policy must be an inline object literal`);
    }
    calls.push({ node, allowUploadToken });
  });
  return calls;
}

function resolvesToBoundary(expression, ast, imports, seen = new Set()) {
  if (!expression || seen.has(expression)) return false;
  seen.add(expression);
  if (ts.isIdentifier(expression)) {
    const declaration = findDeclaration(ast, expression.text);
    if (!declaration) return false;
    return resolvesToBoundary(declaration, ast, imports, seen);
  }
  if (ts.isCallExpression(expression)) {
    if (ts.isIdentifier(expression.expression) && expression.expression.text === 'withAuthenticatedApi') return true;
    if (ts.isIdentifier(expression.expression) && expression.expression.text === 'withObservability') {
      const imported = imports.some(item =>
        item.module === '@/lib/with-observability' && item.name === 'withObservability' && !item.alias
      );
      return imported && expression.arguments.length > 0 && resolvesToBoundary(expression.arguments[0], ast, imports, seen);
    }
    return false;
  }
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return resolvesToBoundary(expression.expression, ast, imports, seen);
  }
  return false;
}

function expressionContainsCall(expression, target, ast, seen = new Set()) {
  if (!expression || seen.has(expression)) return false;
  seen.add(expression);
  if (expression === target) return true;
  if (ts.isIdentifier(expression)) {
    const declaration = findDeclaration(ast, expression.text);
    return declaration ? expressionContainsCall(declaration, target, ast, seen) : false;
  }
  if (ts.isCallExpression(expression)) {
    return expression.arguments.some(argument => expressionContainsCall(argument, target, ast, seen));
  }
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    return expressionContainsCall(expression.expression, target, ast, seen);
  }
  return false;
}

function findDeclaration(ast, name) {
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer;
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
  }
  return undefined;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}

function isRestrictedImport(moduleName, restricted, file) {
  if (moduleName === restricted) return true;
  if (!moduleName.startsWith('.')) return false;
  const resolvedModule = resolve(appRoot, dirname(file), moduleName);
  const restrictedPath = resolve(appRoot, restricted.slice(2));
  return resolvedModule === restrictedPath || `${resolvedModule}.ts` === restrictedPath ||
    `${resolvedModule}.tsx` === restrictedPath || `${resolvedModule}/index.ts` === restrictedPath;
}
