import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('firebase.json', root), 'utf8'));
const routes = config.hosting.rewrites.filter(route => route.function);

async function clientCalls(directory) {
  const calls = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) calls.push(...await clientCalls(url));
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(url, 'utf8');
      for (const match of source.matchAll(/(?:postProtectedFunction|postAppCheckedFunction)\(\s*['"](\/[^'"]+)['"]/g)) {
        calls.push({ path: match[1], file: url.pathname });
      }
    }
  }
  return calls;
}

test('every current client Function call has one matching same-origin hosting route', async () => {
  const calls = [...await clientCalls(new URL('js/', root)), ...await clientCalls(new URL('app/js/', root))];
  assert.ok(calls.length > 0, 'Client endpoint discovery must find the active API callers');
  for (const call of calls) {
    const matches = routes.filter(route => route.source === call.path);
    assert.equal(matches.length, 1, `${call.file}: ${call.path} needs exactly one hosting route`);
    assert.equal(matches[0].function, call.path.slice(1), `${call.path} must reach its declared Function`);
  }
});

test('hosting Function routes have unique source paths', () => {
  assert.equal(new Set(routes.map(route => route.source)).size, routes.length);
});
