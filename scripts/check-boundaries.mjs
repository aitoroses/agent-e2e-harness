#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();

const adapterForbiddenSpecifierPatterns = [
  /(^|[/@])playwright($|[-/])/i,
  /^@modelcontextprotocol\/sdk($|\/)/i,
  /^@testcontainers\//i,
  /^testcontainers($|\/)/i,
  /^next($|\/)/i,
  /^react($|\/)/i,
  /^react-dom($|\/)/i,
  /^pg($|\/)/i,
  /(^|\/)apps\/showcase(\/|$)/i
];

const boundaryScopes = [
  {
    label: 'core',
    description: 'packages/harness/src/core has no Playwright, MCP, Testcontainers, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/core'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns,
    negativeFixtures: [
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/playwright-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/mcp-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/testcontainers-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/showcase-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/react-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/core/db-import.ts')
    ]
  },
  {
    label: 'artifacts',
    description: 'packages/harness/src/artifacts has no adapter, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/artifacts'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns,
    negativeFixtures: []
  },
  {
    label: 'stack',
    description: 'packages/harness/src/stack has no provider-specific adapter, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/stack'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns,
    negativeFixtures: []
  },
  {
    label: 'dev-mcp',
    description: 'packages/harness/src/dev-mcp has no Playwright, Testcontainers, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/dev-mcp'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns.filter(
      (pattern) => String(pattern) !== String(/^@modelcontextprotocol\/sdk($|\/)/i),
    ),
    negativeFixtures: []
  },
  {
    label: 'playwright-mcp',
    description: 'packages/harness/src/playwright-mcp has no MCP SDK, Testcontainers, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/playwright-mcp'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns.filter(
      (pattern) => String(pattern) !== String(/(^|[/@])playwright($|[-/])/i),
    ),
    negativeFixtures: []
  },
  {
    label: 'mcp',
    description: 'packages/harness/src/mcp stays execution-neutral and has no Playwright, HTTP MCP transport, Testcontainers, app, React, or DB imports',
    dir: resolve(repoRoot, 'packages/harness/src/mcp'),
    forbiddenSpecifierPatterns: adapterForbiddenSpecifierPatterns,
    negativeFixtures: [
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/mcp/playwright-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/mcp/http-mcp-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/mcp/testcontainers-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/mcp/showcase-import.ts'),
      resolve(repoRoot, 'packages/harness/test-fixtures/boundary-imports/mcp/react-import.ts')
    ]
  }
];

function tsFilesUnder(path) {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isFile()) return extname(path) === '.ts' ? [path] : [];

  return readdirSync(path)
    .flatMap((entry) => tsFilesUnder(join(path, entry)))
    .filter((file) => !file.endsWith('.d.ts'));
}

function moduleSpecifierText(node) {
  if (!node) return undefined;
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function collectForbiddenImports(filePath, forbiddenSpecifierPatterns) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations = [];

  function record(specifier, node) {
    if (specifier && forbiddenSpecifierPatterns.some((pattern) => pattern.test(specifier))) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file: relative(repoRoot, filePath),
        specifier,
        line: position.line + 1,
        column: position.character + 1
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(moduleSpecifierText(node.moduleSpecifier), node);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      record(moduleSpecifierText(node.arguments[0]), node);
    }

    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument)) {
        record(moduleSpecifierText(argument.literal), node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function checkPath(path, scope, { requireExists = false } = {}) {
  if (requireExists && !existsSync(path)) {
    console.error(`${scope.label} boundary check failed: required path does not exist: ${relative(repoRoot, path)}`);
    process.exit(1);
  }

  return tsFilesUnder(path).flatMap((file) => collectForbiddenImports(file, scope.forbiddenSpecifierPatterns));
}

function printViolations(violations) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}:${violation.column} imports forbidden specifier "${violation.specifier}"`);
  }
}

if (process.argv.includes('--self-test')) {
  for (const scope of boundaryScopes) {
    for (const negativeFixture of scope.negativeFixtures) {
      const fixtureViolations = checkPath(negativeFixture, scope, { requireExists: true });
      if (fixtureViolations.length === 0) {
        console.error(`${scope.label} boundary self-test failed: negative fixture was not rejected: ${relative(repoRoot, negativeFixture)}`);
        process.exit(1);
      }
    }
  }
}

const allViolations = boundaryScopes.flatMap((scope) => checkPath(scope.dir, scope, { requireExists: true }));
if (allViolations.length > 0) {
  printViolations(allViolations);
  process.exit(1);
}

for (const scope of boundaryScopes) {
  console.log(`${scope.label} boundary check passed: ${scope.description}`);
}
