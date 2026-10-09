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
let handlers = 0;
for (const page of app.pages) {
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
console.log(JSON.stringify({ javascriptFiles: files.length, registeredPages: app.pages.length, boundHandlers: handlers, wxmlExpressions: expressions, result: 'passed' }));
