import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mainSource = fs.readFileSync(path.join(root, 'app/js/main.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'app/styles/runtime-shell.css'), 'utf8');

assert.match(mainSource, /loading\.style\.backgroundColor = '#000'/, 'loading must stay opaque before its image decodes');
assert.match(mainSource, /loading\.style\.backgroundImage = `linear-gradient/, 'transition must retain its configured image');
assert.doesNotMatch(mainSource, /loading\.style\.background = `linear-gradient/, 'background shorthand must not erase the opaque fallback');
assert.match(cssSource, /#loading\s*\{[^}]*background:\s*#000/s, 'CSS must provide the same opaque first-paint fallback');

for (const asset of [
  'assets/landing/city.jpg',
  'assets/landing/moon.jpg',
  'assets/landing/space.jpg'
]) {
  assert.equal(fs.existsSync(path.join(root, asset)), true, `${asset} must exist`);
}

console.log(JSON.stringify({
  ok: true,
  loadingFallback: 'opaque-black',
  previousCityVisibility: 'blocked-before-image-decode'
}, null, 2));
