import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCS } from '../app/js/config.js';
import { BUILTIN_DISCOVERY_CATALOGS, FIELD_DISCOVERY_CATALOG, validateDiscoveryCatalogs } from '../app/js/discovery/catalog.js';
import {
  REGIONAL_ECOLOGY_PACKS,
  REGIONAL_TAXON_DISCOVERIES,
  resolveRegionalEcologyPack,
  validateRegionalEcologyPackCollection
} from '../app/js/discovery/ecology/regional-packs.js';
import { compileFieldActivityPlan } from '../app/js/discovery/field-activities.js';

const EXPECTED_PRESET_PACKS = Object.freeze({
  baltimore: 'us-md-baltimore-chesapeake-pilot',
  hollywood: 'us-ca-urban-coast',
  newyork: 'us-nyc-northeast-urban',
  miami: 'us-fl-south-florida-coast',
  tokyo: 'jp-kanto-urban-nature',
  monaco: 'mc-ligurian-mediterranean',
  nurburgring: 'eu-atlantic-urban-nature',
  lasvegas: 'us-nv-mojave-desert',
  london: 'eu-atlantic-urban-nature',
  paris: 'eu-atlantic-urban-nature',
  dubai: 'ae-dubai-desert-gulf',
  sanfrancisco: 'us-ca-urban-coast',
  losangeles: 'us-ca-urban-coast',
  chicago: 'us-il-chicago-great-lakes',
  seattle: 'us-wa-puget-sound'
});

const ALL_CONTEXTS = Object.freeze([
  'urban', 'park', 'forest', 'field', 'wetland', 'riverbank', 'fresh-water',
  'coast', 'desert', 'outcrop'
]);

function environmentAt(id, location) {
  const worldIdentity = Object.freeze({
    type: 'WorldIdentity', id: `world:${id}:regional-ecology`,
    location: Object.freeze({ lat: location.lat, lon: location.lon })
  });
  return Object.freeze({
    type: 'EnvironmentContextPublication', requestId: `request:${id}`, sequence: 1, worldIdentity,
    temporal: Object.freeze({ month: 8, localTimeBand: 'day' }),
    cells: Object.freeze([Object.freeze({
      cellId: 'cell:0:0', contexts: ALL_CONTEXTS,
      bounds: Object.freeze({ minX: -80, maxX: 80, minZ: -80, maxZ: 80 })
    })])
  });
}

function photographEligibility(environment) {
  return Object.freeze({
    type: 'GeographicEligibilityPublication', requestId: environment.requestId,
    sequence: environment.sequence, worldIdentity: environment.worldIdentity,
    catalogBundleVersion: 'regional-expansion-contract-v1',
    eligible: Object.freeze([Object.freeze({ catalogId: 'photograph', cellIds: Object.freeze(['cell:0:0']) })])
  });
}

test('the regional registry contains eleven source-bounded packs and 180 unique taxa', () => {
  const validation = validateRegionalEcologyPackCollection();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(validation.packCount, 11);
  assert.equal(validation.taxonCount, 180);
  assert.equal(REGIONAL_TAXON_DISCOVERIES.length, 180);
  assert.equal(new Set(REGIONAL_ECOLOGY_PACKS.map((pack) => pack.id)).size, 11);
  assert.equal(new Set(REGIONAL_TAXON_DISCOVERIES.map((entry) => entry.id)).size, 180);
});

test('every built-in Earth destination resolves by coordinates to its intended regional pack', () => {
  assert.deepEqual(Object.keys(LOCS).sort(), Object.keys(EXPECTED_PRESET_PACKS).sort(),
    'new presets must receive an explicit reviewed-pack decision');
  for (const [presetId, location] of Object.entries(LOCS)) {
    assert.equal(resolveRegionalEcologyPack(location)?.id, EXPECTED_PRESET_PACKS[presetId], presetId);
  }
  assert.equal(resolveRegionalEcologyPack({ lat: -33.8688, lon: 151.2093 }), null,
    'unsupported places must retain the honest global field-guide fallback');
});

test('each built-in destination produces regional field leads through the shared planner', () => {
  for (const [presetId, location] of Object.entries(LOCS)) {
    const environment = environmentAt(presetId, location);
    const plan = compileFieldActivityPlan(environment, photographEligibility(environment), { slotsPerCell: 3 });
    const expectedPackId = EXPECTED_PRESET_PACKS[presetId];
    assert.equal(plan.diagnostics.regionalEcologyPackId, expectedPackId, presetId);
    assert.ok(plan.diagnostics.regionalTaxonCount >= 12, presetId);
    assert.equal(plan.slots.length, 3, presetId);
    assert.ok(plan.slots.every((slot) => slot.regionalPackId === expectedPackId), presetId);
    assert.ok(plan.slots.every((slot) => slot.supportingEvidence.includes('no-live-presence-claim')), presetId);
    assert.ok(plan.slots.every((slot) => slot.sourceRefs.length === 2), presetId);
  }
});

test('expanded taxon records preserve licensing, sensitive-species, and player-language boundaries', () => {
  for (const pack of REGIONAL_ECOLOGY_PACKS) {
    assert.equal(pack.truthPolicy.livePresenceLanguageAllowed, false);
    assert.equal(pack.truthPolicy.occurrenceRecordsIncluded, false);
    assert.equal(pack.truthPolicy.abundanceModelIncluded, false);
    assert.equal(pack.truthPolicy.osmSpeciesInferenceAllowed, false);
    for (const taxon of pack.taxa) {
      assert.equal(taxon.livePresenceClaimAllowed, false);
      assert.equal(taxon.presentation.assetStatus, 'no-media-bundled');
      assert.equal(taxon.presentation.mobileBudget.textureBytes, 0);
      if (taxon.sensitiveSpecies) assert.match(taxon.sensitiveLocationPolicy, /generalize|suppress/);
      taxon.sourceRefs.forEach((ref) => assert.doesNotMatch(ref.license, /BY-NC|NONCOMMERCIAL/i));
    }
  }
  REGIONAL_TAXON_DISCOVERIES.forEach((entry) => {
    assert.doesNotMatch(entry.description, /procedural encounter/i);
    assert.match(entry.description, /do not claim a real organism is present/i);
  });
});

test('the complete discovery catalog accepts all expanded regional taxa without duplicate identities', () => {
  const validation = validateDiscoveryCatalogs(BUILTIN_DISCOVERY_CATALOGS);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  const catalogIds = FIELD_DISCOVERY_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(catalogIds).size, catalogIds.length);
  REGIONAL_TAXON_DISCOVERIES.forEach((entry) => {
    assert.equal(FIELD_DISCOVERY_CATALOG.find((candidate) => candidate.id === entry.id)?.regionalPackId, entry.regionalPackId);
  });
});
