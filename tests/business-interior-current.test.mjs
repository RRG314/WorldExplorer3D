import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poiInteriorProgram,
  interiorProgramForDefinition,
} from '../app/js/poi/interior-program.js';
import { classifyPoi, normalizePoi } from '../app/js/poi/semantic-authority.js';
import { playablePoiTarget } from '../app/js/game/poi-map-visibility.js';
import {
  createBusinessFixturePlan,
  businessFixtureFits,
} from '../app/js/interiors/business-plan.js';
import { quietIndicatorPlacement } from '../app/js/ui/hud-layout.js';
const footprint = [
    { x: -8, z: -7 },
    { x: 8, z: -7 },
    { x: 8, z: 7 },
    { x: -8, z: 7 },
  ],
  entry = { x: 0, z: -5 };
test('visitable businesses do not acquire commerce or health capabilities', () => {
  for (const [tags, program] of [
    [{ amenity: 'cafe' }, 'food-service'],
    [{ tourism: 'hotel' }, 'hotel-lobby'],
    [{ amenity: 'bank' }, 'banking'],
    [{ amenity: 'library' }, 'library'],
    [{ amenity: 'post_office' }, 'postal'],
    [{ amenity: 'school' }, 'education'],
  ]) {
    assert.equal(poiInteriorProgram(tags), program);
    const semantic = classifyPoi({ tags });
    assert.equal(semantic.interiorArchetype, program);
    assert.deepEqual(semantic.capabilities, []);
    assert.equal(semantic.functional, false);
  }
});
test('authored, captured, private and curated representations retain precedence', () => {
  for (const key of [
    'accessDenied',
    'communityRealityCapture',
    'authoredLayout',
    'curatedContent',
    'aquariumContent',
    'cernContent',
    'facilityContent',
  ])
    assert.equal(
      interiorProgramForDefinition({ [key]: true, building: { buildingType: 'hotel' } }),
      ''
    );
  assert.equal(interiorProgramForDefinition({ building: { buildingType: 'office' } }), 'office');
});
test('a map destination needs both business semantics and a currently published admitted entrance', () => {
  const poi = { sourceFeatureId: 'node:123', x: 1, z: 2, tags: { amenity: 'cafe' } },
    record = normalizePoi(poi),
    byId = new Map([
      [
        record.id,
        { ...record, buildingAssociation: { sourceBuildingId: 'way:9', enterable: true } },
      ],
    ]);
  assert.equal(playablePoiTarget(poi, { byId }, new Map()), null);
  const doors = new Map([['way:9', { x: 3, z: 4, approachX: 5, approachZ: 6 }]]);
  assert.deepEqual(playablePoiTarget(poi, { byId }, doors), {
    x: 5,
    z: 6,
    sourceBuildingId: 'way:9',
    program: 'food-service',
    poiId: record.id,
  });
  byId.set(record.id, {
    ...record,
    buildingAssociation: { sourceBuildingId: 'way:9', enterable: false },
  });
  assert.equal(playablePoiTarget(poi, { byId }, doors), null);
});
test('business fixture programs remain inside the shell and clear the entrance', () => {
  for (const program of [
    'food-service',
    'hotel-lobby',
    'medical-service',
    'automotive-service',
    'banking',
    'postal',
    'education',
    'library',
    'civic-service',
    'visitor-gallery',
    'office',
    'general-retail',
  ]) {
    const plan = createBusinessFixturePlan({ footprint, entry, program });
    assert.ok(plan.length >= 2 && plan.length <= 18, program);
    for (const [i, item] of plan.entries())
      assert.ok(businessFixtureFits(item, footprint, entry, [], plan.slice(0, i)), program);
  }
});
test('concave courtyards and physical blockers are not filled by a rectangular shortcut', () => {
  const shape = [
      { x: -8, z: -7 },
      { x: 8, z: -7 },
      { x: 8, z: -2 },
      { x: 0, z: -2 },
      { x: 0, z: 7 },
      { x: -8, z: 7 },
    ],
    wall = { minX: -8, maxX: -5, minZ: 1, maxZ: 7 };
  const plan = createBusinessFixturePlan({ footprint: shape, entry, colliders: [wall] });
  for (const f of plan) assert.ok(businessFixtureFits(f, shape, entry, [wall]));
  assert.deepEqual(createBusinessFixturePlan({ footprint: [] }), []);
});
test('quiet indicator avoids phone controls and stays above the lower right actions', () => {
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
  const occupied = [
    rect(10, 696, 142, 828),
    rect(205, 715, 380, 828),
    rect(272, 592, 380, 700),
    rect(330, 12, 378, 60),
    rect(12, 12, 272, 90),
  ];
  const p = quietIndicatorPlacement(390, 844, occupied);
  assert.ok(p);
  assert.equal(p.x, 334);
  assert.equal(p.y, 536);
  for (const r of occupied)
    assert.ok(
      p.x + 44 <= r.left - 6 || p.x >= r.right + 6 || p.y + 44 <= r.top - 6 || p.y >= r.bottom + 6
    );
});

test('leaving a room releases a late furniture lease before it can attach', async () => {
  const { attachBusinessAssets, disposeBusinessAssets } = await import(
    '../app/js/interiors/business-scene.js'
  );
  let resolve,
    disposed = 0,
    current = true;
  const active = { businessModelPlacements: [{ assetId: 'workspace-chair' }] };
  const pending = attachBusinessAssets({}, active, {
    isCurrent: () => current,
    loadAsset: () => new Promise((r) => (resolve = r)),
  });
  current = false;
  disposeBusinessAssets(active);
  resolve({ dispose: () => disposed++ });
  assert.equal(await pending, false);
  assert.equal(disposed, 1);
  assert.equal(active.businessAssetAttachment, null);
});
test('room cleanup detaches furniture through the supported Three parent API', async () => {
  const { disposeBusinessAssets } = await import('../app/js/interiors/business-scene.js');
  let removed = 0,
    disposed = 0;
  const fallback = { visible: false },
    holder = { parent: { remove: () => removed++ } },
    active = {
      businessAssetAttachment: {
        instances: [{ holder, fallback, instance: { dispose: () => disposed++ } }],
      },
    };
  disposeBusinessAssets(active);
  assert.equal(removed, 1);
  assert.equal(disposed, 1);
  assert.equal(fallback.visible, true);
  assert.equal(active.businessAssetAttachment, null);
});
test('a shared building uses the requested business without retaining another world’s navigation', async () => {
  const { selectPoiTenancy } = await import('../app/js/poi/interior-program.js');
  const tenants = [
      { id: 'a', source: { name: 'Bank' }, semantic: { interiorArchetype: 'banking' } },
      { id: 'b', source: { name: 'Café' }, semantic: { interiorArchetype: 'food-service' } },
    ],
    navigation = { owner: 'poi', world: 4, x: 10, z: 20, label: 'Café' },
    entrance = { approachX: 10, approachZ: 20 };
  assert.equal(selectPoiTenancy(tenants, { navigation, entrance, world: 4 }).id, 'b');
  assert.equal(selectPoiTenancy(tenants, { navigation, entrance, world: 5 }).id, 'a');
  assert.equal(
    selectPoiTenancy(tenants, { navigation: { ...navigation, x: 100 }, entrance, world: 4 }).id,
    'a'
  );
  assert.equal(selectPoiTenancy(tenants, { destinationId: 'b' }).id, 'b');
});
test('ordinary proximity scans need no destination or navigation intent', async () => {
  const { ctx } = await import('../app/js/shared-context.js?v=55');
  const { pickNearbyEnterableBuildingSupport } = await import('../app/js/building-entry.js');
  const previous = ctx.getNearbyBuildings;
  try {
    ctx.getNearbyBuildings = () => [];
    assert.equal(pickNearbyEnterableBuildingSupport(0, 0), null);
  } finally {
    ctx.getNearbyBuildings = previous;
  }
});
