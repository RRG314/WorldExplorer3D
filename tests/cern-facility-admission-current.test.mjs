import test from 'node:test';
import assert from 'node:assert/strict';
import { earthCoordinateFrame } from '../app/js/earth-core/coordinate-frame.js?v=1';
import { CERN_SITE_REFERENCE } from '../app/js/interiors/cern-site-reference.js';
import { resolveCernInterior } from '../app/js/interiors/cern-content.js';
function fixture(site) {
  const frame = earthCoordinateFrame(site.footprint[0], 111000),
    geoToWorld = (lat, lon) => frame.toWorld(lat, lon),
    pts = site.footprint.map((p) => geoToWorld(p.lat, p.lon)),
    a = pts[0],
    b = pts[1],
    support = {
      key: site.sourceBuildingId,
      enterable: true,
      building: {
        sourceBuildingId: site.sourceBuildingId,
        pts,
        buildingProvenance: { valid: true },
      },
      entryAnchor: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
    };
  return {
    ctx: { geoToWorld, METERS_PER_WORLD_UNIT: 1 },
    support,
    definition: { mode: 'generated', label: 'Mapped building' },
  };
}
test('CERN content binds the two distinct reviewed mapped footprints and rejects a renamed neighbour, wrong wing or synthetic support', () => {
  for (const site of CERN_SITE_REFERENCE) {
    const { ctx, support, definition } = fixture(site),
      result = resolveCernInterior(ctx, support, definition);
    assert.equal(result.cernContent.siteId, site.id);
    assert.ok(result.contentAssociation.errorMeters < 1e-8);
    assert.equal(result.cernContent.accuracy, 'interpretive-training-visit');
    for (const altered of [
      { ...support, synthetic: true },
      { ...support, enterable: false },
      {
        ...support,
        key: 'neighbour',
        building: { ...support.building, sourceBuildingId: 'way/1', name: site.label },
      },
      {
        ...support,
        building: {
          ...support.building,
          pts: support.building.pts.map((p) => ({ ...p, x: p.x + 10 })),
        },
      },
    ])
      assert.equal(resolveCernInterior(ctx, altered, definition), definition);
  }
  assert.notEqual(CERN_SITE_REFERENCE[0].sourceBuildingId, CERN_SITE_REFERENCE[1].sourceBuildingId);
});
test('CERN content preserves access-denied, recorded/mapped and already authored interiors instead of granting entry or replacing their rooms', () => {
  const { ctx, support, definition } = fixture(CERN_SITE_REFERENCE[0]);
  for (const extra of [
    { accessDenied: true },
    { communityRealityCapture: { id: 'retained' } },
    { mode: 'mapped' },
    { authoredLayout: { id: 'retained' } },
    { curatedContent: { id: 'retained' } },
    { aquariumContent: { id: 'retained' } },
    { facilityContent: { id: 'retained' } },
  ]) {
    const retained = { ...definition, ...extra };
    assert.equal(resolveCernInterior(ctx, support, retained), retained);
  }
});

test('reviewed Overture aliases still require the same physical source footprint and cannot admit a neighbouring wing', () => {
  for (const site of CERN_SITE_REFERENCE) {
    const { ctx, support, definition } = fixture(site),
      id = site.sourceAliases[0],
      alias = {
        ...support,
        key: id,
        building: {
          ...support.building,
          sourceBuildingId: id,
          pts: support.building.pts.map((p) => ({ ...p, x: p.x + 0.25 })),
        },
      };
    assert.equal(resolveCernInterior(ctx, alias, definition).cernContent.siteId, site.id);
    const wrong = {
      ...alias,
      building: { ...alias.building, pts: alias.building.pts.map((p) => ({ ...p, x: p.x + 3 })) },
    };
    assert.equal(resolveCernInterior(ctx, wrong, definition), definition);
  }
});
