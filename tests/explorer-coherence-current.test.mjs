import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

import { createExplorerStoryEvent, explorerProgressSnapshot } from '../app/js/discovery/explorer-events.js';
import { RELEASED_EXPLORER_TOOLS } from '../app/js/discovery/explorer-goals.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';
import { RELEASED_EXPLORER_ACTIVITIES } from '../app/js/discovery/runtime.js';
import { REGIONAL_ECOLOGY_PACKS, validateRegionalEcologyPackCollection } from '../app/js/discovery/ecology/regional-packs.js';

const require = createRequire(import.meta.url);
const { normalizeDiscoveryClaim } = require('../functions/discovery.js');

test('one idempotent Explorer story event updates the shared Journal and matching path', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const input = {
    eventId: 'event:activity-completed:roof-run:1',
    eventType: 'activity-completed',
    sourceSystem: 'games-and-activities',
    sourceId: 'roof-run',
    pathId: 'activity',
    name: 'Roof Run',
    regionId: 'baltimore',
    regionLabel: 'Baltimore',
    firstCompletion: true,
    points: 2
  };
  const event = createExplorerStoryEvent(input);
  assert.equal(event.projections.journal, true);
  assert.equal(event.projections.fieldGuide, false);
  assert.equal(event.projections.collection, false);
  assert.equal((await store.recordExplorerEvent(input)).recorded, true);
  assert.equal((await store.recordExplorerEvent(input)).recorded, false);
  const progress = explorerProgressSnapshot((await store.getProfile()).explorerProgress);
  assert.equal(progress.points, 2);
  assert.deepEqual(progress.paths.activity, { points: 2, records: 1, firsts: 1 });
  assert.equal((await store.listEvents()).length, 1);
});

test('field records still project through Journal, Guide, rank, and the Fieldwork path', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const result = await store.recordObservation({
    claimId: 'claim:field:test:1', catalogId: 'test-bird', name: 'Test Bird',
    family: 'bird-taxon', taxonGroup: 'bird', discipline: 'nature',
    activityId: 'photograph', regionId: 'test-region', regionLabel: 'Test Region',
    worldIdentity: 'test-region', evidenceClass: 'guided-field-lead', collectedAt: 1
  });
  assert.equal(result.recorded, true);
  assert.equal(result.event.projections.fieldGuide, true);
  assert.equal((await store.listFieldGuide()).length, 1);
  const progress = explorerProgressSnapshot((await store.getProfile()).explorerProgress);
  assert.equal(progress.paths.field.records, 1);
  assert.equal(progress.paths.field.firsts, 1);
});

test('every displayed regional life-list taxon has a released play path', () => {
  const regionalValidation = validateRegionalEcologyPackCollection();
  assert.equal(regionalValidation.ok, true);
  assert.equal(regionalValidation.packCount, 11);
  assert.equal(regionalValidation.taxonCount, 180);
  assert.equal(RELEASED_EXPLORER_ACTIVITIES.has('sonar-survey'), true);
  assert.equal(RELEASED_EXPLORER_TOOLS.includes('portable-sonar'), true);
  for (const pack of REGIONAL_ECOLOGY_PACKS) {
    const unreachable = pack.taxa.filter((taxon) => !taxon.activityIds.some((id) => RELEASED_EXPLORER_ACTIVITIES.has(id)));
    assert.deepEqual(unreachable.map((taxon) => taxon.id), [], `${pack.id} contains unreachable life-list taxa`);
  }
});

test('server receipt vocabulary accepts current field and fishing evidence without accepting arbitrary values', () => {
  const base = { claimId: 'claim:test:1', catalogId: 'taxon-1', worldIdentity: 'world:test', activityId: 'photograph' };
  for (const evidenceClass of ['guided-field-lead', 'guided-exploration-lead', 'virtual-fishing-catch']) {
    assert.equal(normalizeDiscoveryClaim({ ...base, evidenceClass })?.evidenceClass, evidenceClass);
  }
  assert.equal(normalizeDiscoveryClaim({ ...base, evidenceClass: 'anything-goes' }), null);
});

test('Explorer surfaces use player language and keep Backpack viewing distinct from equipped state', async () => {
  const [html, runtime, equipmentRuntime, shellStyles] = await Promise.all([
    readFile(new URL('../app/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/discovery/runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/js/urban-sandbox/equipment-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles/runtime-shell.css', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(html, /game-generated field lead/i);
  assert.doesNotMatch(html, /Places &amp; Contacts/i);
  assert.doesNotMatch(runtime, /CREATURE QUALITY/);
  assert.doesNotMatch(runtime, /reference fallbacks.*reviewed media\/model promotions/i);
  assert.doesNotMatch(runtime, /Unknown \$\{escapeHtml\(displayDiscoveryLabel/);
  assert.match(html, /data-discovery-tab="journal"/);
  assert.match(html, /All paths/);
  assert.match(html, /Journal backup and account status/);
  assert.match(equipmentRuntime, /selected \? ' aria-current="true"'/);
  assert.match(equipmentRuntime, /item\.equipped \? ' equipped'/);
  assert.match(shellStyles, /urbanBackpackItem\.selected/);
  assert.match(shellStyles, /content:'VIEWING'/);
});
