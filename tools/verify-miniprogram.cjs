const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../miniprogram');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(root).filter(f => f.endsWith('.js'));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
// WXML does not decode HTML entities inside its expression grammar.
// JS syntax checks and event-binding checks alone cannot detect this error.
let expressions = 0;
for (const file of walk(root).filter(f => f.endsWith('.wxml'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    assert.doesNotMatch(match[1], /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i, `${file}: HTML entity inside WXML expression`);
    expressions++;
  }
}
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
// Main-package code must be reachable from app.js or a main-package page.
// Subpackage-only helpers belong under their package, not in main services.
const mainUsed = new Set();
function visitMain(file) {
  if (mainUsed.has(file)) return;
  assert.ok(!file.includes(`${path.sep}packages${path.sep}`), `Main package imports subpackage: ${file}`);
  mainUsed.add(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), match[1]);
    visitMain(target.endsWith('.js') ? target : target + '.js');
  }
}
for (const entry of ['app', ...app.pages]) visitMain(path.join(root, entry + '.js'));
for (const file of files.filter(f => !f.includes(`${path.sep}packages${path.sep}`))) {
  assert.ok(mainUsed.has(file), `Unused JS in main package: ${path.relative(root, file)}`);
}
let handlers = 0;
const registeredPages = [...app.pages, ...(app.subPackages || []).flatMap(p => p.pages.map(page => `${p.root}/${page}`))];
for (const page of registeredPages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.ok(fs.existsSync(path.join(root, page + '.' + extension)), `${page}: missing .${extension}`);
  }
  const file = path.join(root, page + '.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), Page: d => { definition = d; }, wx: {}, getApp: () => ({ globalData: {} }), console, setTimeout, clearTimeout }, { filename: file });
  assert.ok(definition, page);
  const wxml = fs.readFileSync(path.join(root, page + '.wxml'), 'utf8');
  for (const match of wxml.matchAll(/(?:bind|catch)(?::)?[a-zA-Z]+\s*=\s*["']([a-zA-Z_$][\w$]*)["']/g)) {
    assert.equal(typeof definition[match[1]], 'function', `${page}: ${match[1]}`);
    handlers++;
  }
}
console.log(JSON.stringify({ javascriptFiles: files.length, registeredPages: registeredPages.length, boundHandlers: handlers, wxmlExpressions: expressions, mainPackageUnusedJS: 0, result: 'passed' }));
