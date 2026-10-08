import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PRODUCT_CAPABILITIES, CAPABILITY_STATUS, CAPABILITY_GROUPS, findProductCapabilities } from '../app/js/product/capabilities.js';
import { ACTIVITY_TEMPLATES } from '../app/js/activity-discovery/schema-core.js';
import { ACTIVITY_CATALOG, TOOL_CATALOG } from '../app/js/discovery/catalog.js';
import { LIVE_EARTH_LAYERS } from '../app/js/live-earth/registry.js';
test('all exposed catalog families retain an owner, persistence boundary and explicit evidence limitation', async () => {
  const ids = new Set();
  for (const entry of PRODUCT_CAPABILITIES) {
    assert.equal(ids.has(entry.id), false); ids.add(entry.id);
    assert.ok(Object.hasOwn(CAPABILITY_STATUS, entry.status));
    assert.ok(Object.hasOwn(CAPABILITY_GROUPS, entry.group));
    assert.ok(entry.summary && entry.persistence && entry.acceptance);
    assert.equal((await fs.stat(new URL('../' + entry.owner, import.meta.url))).isFile(), true);
  }
  for (const id of ['earth','moon','mars','space','ocean','walk','drive','drone','plane','boat','swimming','research-ship']) assert.ok(ids.has(id));
  for (const [prefix, entries] of [['route',ACTIVITY_TEMPLATES],['field',ACTIVITY_CATALOG],['tool',TOOL_CATALOG],['layer',Object.values(LIVE_EARTH_LAYERS)]]) {
    for (const entry of entries) assert.ok(ids.has(`${prefix}:${entry.id}`));
  }
});
test('search distinguishes limited swimming from a virtual tool as a controller', () => {
  const results = findProductCapabilities({ query: 'swimming' });
  assert.equal(results.find(entry => entry.id === 'swimming').status, 'limited');
  assert.match(PRODUCT_CAPABILITIES.find(entry => entry.id === 'tool:virtual-dive-kit').summary, /not a swimming controller/);
  assert.match(PRODUCT_CAPABILITIES.find(entry => entry.id === 'layer:ships').summary, /not live AIS/);
  assert.match(PRODUCT_CAPABILITIES.find(entry => entry.id === 'journal').persistence, /does not copy/);
});
test('filters preserve categories and unknown searches return an honest empty list', () => {
  assert.ok(findProductCapabilities({ group: 'worlds' }).every(entry => entry.group === 'worlds'));
  assert.equal(findProductCapabilities({ query: 'no-such-capability-9876' }).length, 0);
  assert.ok(findProductCapabilities({ query: 'planned' }).every(entry => entry.status === 'planned'));
});
