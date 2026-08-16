import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreDirectory = path.join(root, 'app', 'js', 'earth-core');

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

const files = listJavaScriptFiles(coreDirectory);
assert.ok(files.length > 0, 'earth-core must contain at least one module');
const sizeAdvisories = [];

const forbidden = [
  ['shared mutable context', /shared-context\.js|\bappCtx\b/],
  ['DOM access', /\b(?:document|window)\s*\./],
  ['Three.js rendering', /\bTHREE\s*\./],
  ['direct network access', /\bfetch\s*\(/]
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).split(path.sep).join('/');
  const lines = source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
  if (lines > 300) sizeAdvisories.push({ module: relative, lines });
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, `${relative} contains forbidden ${label}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  contract: 'earth-core-isolation-boundary',
  modules: files.length,
  forbiddenDependencies: forbidden.map(([label]) => label),
  sizeAdvisories
}, null, 2));
