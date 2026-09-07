import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalRoomId,
  hasStableMappedBuildingIdentity,
  resolveCanonicalMappedBuilding,
  runtimePublicationState
} from '../app/js/reality-capture/runtime-contract.js';
import { panelIsVisiblyOpen } from '../app/js/tutorial/visibility-contract.js';

function element(classes = [], attributes = {}, hidden = false) {
  return {
    hidden,
    classList: { contains: (name) => classes.includes(name) },
    getAttribute: (name) => attributes[name] ?? null
  };
}

test('Reality Capture publication fails closed until staging is explicitly provisioned', () => {
  assert.deepEqual(runtimePublicationState({}), { enabled: false, reason: 'staging_not_provisioned' });
  assert.equal(runtimePublicationState({ realityCaptureRuntimeConfig: { publicationEnabled: true } }).enabled, false);
  assert.equal(runtimePublicationState({
    realityCaptureRuntimeConfig: { publicationEnabled: true, stagingProvisioned: true }
  }).enabled, true);
});

test('Reality Capture uses the canonical multiplayer room instead of orphan context fields', () => {
  assert.equal(canonicalRoomId({
    currentMultiplayerRoomId: 'STALE',
    getCurrentMultiplayerRoom: () => ({ id: 'ROOM42', code: 'ROOM42' })
  }), 'ROOM42');
  assert.equal(canonicalRoomId({ getCurrentMultiplayerRoom: () => null }), '');
});

test('capture eligibility requires a current canonical mapped building', () => {
  const mapped = { sourceBuildingId: 'osm:way:1', geometrySource: 'osm', minX: 0, maxX: 8, minZ: 0, maxZ: 6 };
  const inferred = { sourceBuildingId: 'inferred:2', geometrySource: 'inferred_road_frontage', minX: 0, maxX: 8, minZ: 0, maxZ: 6 };
  assert.equal(hasStableMappedBuildingIdentity(mapped), true);
  assert.equal(hasStableMappedBuildingIdentity(inferred), false);
  assert.equal(resolveCanonicalMappedBuilding({ buildings: [mapped] }, { id: 'osm:way:1' }), mapped);
  assert.equal(resolveCanonicalMappedBuilding({ buildings: [mapped] }, { id: 'osm:way:missing' }), null);
});

test('tutorial visibility follows rendered panel content, not a mounted shell', () => {
  const mountedControls = element(['show'], { 'aria-hidden': 'false' });
  const collapsedContent = element(['hidden'], { 'aria-hidden': 'true' });
  assert.equal(panelIsVisiblyOpen(mountedControls, collapsedContent), false);
  const expandedControls = element(['show', 'bar-open'], { 'aria-hidden': 'false' });
  const expandedContent = element([], { 'aria-hidden': 'false' });
  assert.equal(panelIsVisiblyOpen(expandedControls, expandedContent), true);
  assert.equal(panelIsVisiblyOpen(element(['show'], { 'aria-hidden': 'true' })), false);
});
