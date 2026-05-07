#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const coreDir = resolve(repoRoot, 'packages/harness/src/core');
const negativeFixtures = [
  resolve(repoRoot, 'scripts/fixtures/core-boundary/playwright-import.ts'),
  resolve(repoRoot, 'scripts/fixtures/core-boundary/mcp-import.ts')
];
const forbiddenSpecifierPatterns = [
  /(^|[/@])playwright($|[-/])/i,
  /(^|[/@])mcp($|[-/])/i,
  /^@modelcontextprotocol\/sdk($|\/)/i
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

function collectForbiddenImports(filePath) {
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

function checkPath(path, { requireExists = false } = {}) {
  if (requireExists && !existsSync(path)) {
    console.error(`core boundary check failed: required path does not exist: ${relative(repoRoot, path)}`);
    process.exit(1);
  }

  return tsFilesUnder(path).flatMap(collectForbiddenImports);
}

function printViolations(violations) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}:${violation.column} imports forbidden specifier "${violation.specifier}"`);
  }
}

if (process.argv.includes('--self-test')) {
  for (const negativeFixture of negativeFixtures) {
    const fixtureViolations = checkPath(negativeFixture, { requireExists: true });
    if (fixtureViolations.length === 0) {
      console.error(`core boundary self-test failed: negative fixture was not rejected: ${relative(repoRoot, negativeFixture)}`);
      process.exit(1);
    }
  }
}

const realViolations = checkPath(coreDir, { requireExists: true });
if (realViolations.length > 0) {
  printViolations(realViolations);
  process.exit(1);
}

console.log('core boundary check passed: packages/harness/src/core has no Playwright or MCP imports');
