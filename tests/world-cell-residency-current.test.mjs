import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';
import { createWorldSnapshot, createWorldSnapshotStore } from '../app/js/earth-core/world-snapshot.js';
import { getLifecycleRegistrySnapshot } from '../app/js/runtime/lifecycle-scope.js?v=2';
import { createWorldCellFacts, createTransportCellFacts, transportFromCellFacts,
  encodeWorldCellFacts, decodeWorldCellFacts } from '../app/js/earth-core/world-cell-facts.js';
import { createRoadRegionLease } from '../app/js/terrain/road-region-lease.js';
import { capturePublishedCell, ownPublishedDistrict, portablePoiInputs } from '../app/js/world/world-cell-adapter.js';
import { captureTransportTerrain, restoreTransportTerrain } from '../app/js/terrain/transport-terrain-snapshot.js';
import {sampleFarFieldGridWorldY} from '../app/js/terrain/far-field-geometry.js';
import { compilePoiLifecycle } from '../app/js/poi/lifecycle.js';
import { buildFarBuildingInstanceBatches } from '../app/js/terrain/far-building-instance-batches.js';
const request = sequence => createWorldLoadRequest({ key: 'custom', lat: 39.2904, lon: -76.6122 }, sequence);
const frame = { origin: request(1).location, axes: { x: 'east', y: 'up', z: 'south' },
  metersPerWorldUnit: 1.11, scaleWorldUnitsPerDegree: 100000 };

test('replacement retires every geographic layer once and an old lease cannot evict its replacement', () => {
  const baseline = getLifecycleRegistrySnapshot().activeScopeCount, store = createWorldSnapshotStore(), retired = [];
  const a = request(1), b = request(2); store.begin(a);
  const old = store.ownRegion({ key: 'regional-window', layers: ['terrain', 'buildings', 'hydrology'], retire: () => retired.push('old') });
  const newer = store.ownRegion({ key: 'regional-window', layers: ['terrain', 'buildings', 'hydrology'], retire: () => retired.push('newer') });
  assert.equal(old.dispose(), false); assert.equal(store.residency().resourceCount, 1);
  store.ownRegion({ key: 'transport:3:0', layers: ['transport', 'contact'], retire: () => retired.push('road') });
  store.begin(b); assert.deepEqual(retired, ['old', 'road', 'newer']);
  assert.equal(newer.dispose(), false); assert.equal(store.residency().resourceCount, 0);
  let late = 0;
  assert.throws(() => store.ownRegion({ key: 'late', expectedRequestId: a.id, layers: ['transport'], retire: () => late++ }), { name: 'AbortError' });
  assert.equal(late, 1);
  const stale = store.publish(createWorldSnapshot({ request: a })); assert.equal(stale.published, false);
  store.clear(); assert.equal(getLifecycleRegistrySnapshot().activeScopeCount, baseline);
  assert.equal(store.publish(createWorldSnapshot({request:b})).reason,'world-inactive');
});

test('world retirement releases a road publication and contact without disposing shared materials or new-world geometry', () => {
  const store = createWorldSnapshotStore(); store.begin(request(1));
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial();
  const old = new THREE.Mesh(new THREE.PlaneGeometry(), material), replacement = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  scene.add(old, replacement); let geometry = 0, contacts = 0, materials = 0;
  old.geometry.addEventListener('dispose', () => geometry++); material.addEventListener('dispose', () => materials++);
  const lease = createRoadRegionLease([old], { remove: () => contacts++ }, '1:0', { store, requestId: request(1).id });
  store.begin(request(2)); assert.equal(lease.dispose(), false);
  assert.deepEqual([geometry, contacts, materials], [1, 1, 0]); assert.deepEqual(scene.children, [replacement]);
  store.clear(); replacement.geometry.dispose(); material.dispose();
});

test('transport adapter consumes the exact full-precision portable packet and interchange preserves its contact geometry', () => {
  const packet = { key: '1:0', bounds: { minX: 1024, maxX: 2048, minZ: 0, maxZ: 1024 }, keys: ['8:0'], roadIndices: [0],
    batches: [{ positions: Float32Array.of(1024.1234, -0, 7.125, 1040, 2.5, 7, 1040, 2.5, 10), indices: Uint32Array.of(0, 1, 2) }] };
  const facts = createTransportCellFacts(packet, { requestId: request(1).id, frame, roads: [{ sourceFeatureId: 'osm:way:7' }] });
  packet.batches[0].positions[0] = 0;
  const restored = decodeWorldCellFacts(encodeWorldCellFacts(facts));
  assert.deepEqual(restored, facts); assert.equal(transportFromCellFacts(restored).sourceIds[0], 'osm:way:7');
  assert.ok(transportFromCellFacts(restored).batches[0].positions[0] > 1024);
  assert.ok(Object.is(restored.layers.transport.batches[0].positions[1], -0));
});

test('portable cells reject runtime objects, unsupported versions, nonfinite data and narrowing buffers', () => {
  const make = layers => createWorldCellFacts({ requestId: 'r', key: '0:0', frame, layers });
  for (const layers of [{ mesh: new THREE.Group() }, { y: NaN }, { scene: () => {} }, { y: Float32Array.of(Infinity) }]) assert.throws(() => make(layers));
  assert.throws(() => createWorldCellFacts({ requestId: 'r', key: 'NaN:0', frame, layers: {} }));
  assert.throws(() => decodeWorldCellFacts('{"type":"WorldCellFacts","schemaVersion":2}'));
  assert.throws(() => decodeWorldCellFacts('{"test":{"bufferType":"Uint8Array","values":[256]}}'), /precision/);
});

test('selected cells keep cross-cell building/bridge identities, entrances, POIs and original terrain contact through a round trip', () => {
  const req = request(1), publication = createWorldSnapshot({ request: req });
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(4096, 4096, 1, 1)); terrain.rotation.x = -Math.PI / 2;
  terrain.geometry.rotateX(-Math.PI / 2); terrain.geometry.attributes.position.array.forEach((_, i, a) => { if (i % 3 === 1) a[i] = 12.123456; });
  terrain.userData = { isTerrainMesh: true, terrainTile: { z: 14, tx: 4704, ty: 6244 }, renderProvenance: { provider: 'fixture', verticalDatum: 'EGM96' } };
  const entrance = { id: 'entrance:bridge-house', buildingSourceId: 'building:7', x: 1025, y: 14, z: 2, provenance: 'mapped' };
  const poi = { sourceFeatureId: 'way:8', provider: 'osm', x: 1025, z: 2, tags: { shop: 'boat' } };
  const building = { sourceBuildingId: 'building:7', minX: 1010, maxX: 1035, minZ: 0, maxZ: 20, baseY: 12, height: 8,
    surfaceFootprint: [{ x: 1010, z: 0 }, { x: 1035, z: 0 }, { x: 1035, z: 20 }], buildingProvenance: { provider: 'osm' } };
  const ctx = { worldPublication: publication, LOC: req.location, SCALE: 100000, METERS_PER_WORLD_UNIT: 1.11,
    buildings: [building], buildingEntranceCatalog: { entrances: [entrance] },
    roads: [{ sourceFeatureId: 'bridge:7', pts: [{ x: 1000, z: 3 }, { x: 1050, z: 3 }], width: 8,
      structureSemantics: { terrainMode: 'elevated' }, transportSurfaceModel: { distances: Float64Array.of(0, 50), centerHeights: Float64Array.of(20.123456789, 21) } }],
    terrainGroup: { children: [terrain] }, TERRAIN_SEGMENTS: 1, poiLifecycle: compilePoiLifecycle(portablePoiInputs([poi]), [building]),
    getFarTerrainSurfaceSnapshot: () => null };
  const left = capturePublishedCell(ctx, publication, '0:0'), right = capturePublishedCell(ctx, publication, '1:0');
  assert.equal(left.layers.buildings[0].id, right.layers.buildings[0].id);
  assert.deepEqual(left.layers.transport, right.layers.transport); assert.deepEqual(left.layers.entrances, right.layers.entrances);
  const decoded = decodeWorldCellFacts(encodeWorldCellFacts(right)); assert.deepEqual(decoded, right);
  assert.equal(decoded.layers.entrances[0].provenance, 'mapped'); assert.equal(decoded.layers.places.length, 1);
  const source = restoreTransportTerrain(right.layers.terrain), target = restoreTransportTerrain(decoded.layers.terrain);
  assert.equal(source.sampleTop(1025, 2), target.sampleTop(1025, 2)); assert.ok(Number.isFinite(target.sampleTop(1025, 2)));
  source.dispose(); target.dispose(); terrain.geometry.dispose(); terrain.material.dispose();
  ctx.worldPublication = createWorldSnapshot({ request: request(2) }); assert.equal(capturePublishedCell(ctx, publication, '0:0'), null);
});

test('pinned identity retirement follows the current POI lifecycle and never erases player overlays or replacement catalogs', () => {
  const store = createWorldSnapshotStore(), req = request(1); store.begin(req);
  const ctx = { worldSnapshotStore: store, buildingEntranceCatalog: { id: 'old' }, poiLifecycle: { id: 'old' },
    activeFunctionalPois: [1], playerEdits: { door: 'retained' } };
  const lease = ownPublishedDistrict(ctx, createWorldSnapshot({ request: req }));
  ctx.activeFunctionalPois = [2]; lease.dispose(); assert.deepEqual(ctx.activeFunctionalPois, []); assert.deepEqual(ctx.playerEdits, { door: 'retained' });
  ctx.buildingEntranceCatalog = { id: 'new' }; ctx.poiLifecycle = { id: 'new' }; store.clear();
  assert.equal(ctx.buildingEntranceCatalog.id, 'new'); assert.equal(ctx.poiLifecycle.id, 'new');
});

test('regional instance identities and original renderer buffers survive cell boundaries and interchange', async () => {
  const material=new THREE.MeshStandardMaterial(),root=new THREE.Group();root.userData.isFarMappedContext=true;
  const meshes=await buildFarBuildingInstanceBatches(THREE,[{identity:'14/4704/6244/7/0',x:1024,z:10,
    baseY:12,width:100,depth:20,height:8,rotationY:.2,color:[.5,.4,.3]}],material,{cellSize:1024});
  root.add(...meshes);
  const publication=createWorldSnapshot({request:request(1)}),ctx={worldPublication:publication,
    LOC:request(1).location,SCALE:100000,METERS_PER_WORLD_UNIT:1.11,terrainGroup:{children:[root]}};
  const left=capturePublishedCell(ctx,publication,'0:0'),right=capturePublishedCell(ctx,publication,'1:0');
  assert.deepEqual(left.layers.regionalBuildings,right.layers.regionalBuildings);
  assert.deepEqual(right.layers.regionalBuildings[0].sourceIds,['14/4704/6244/7/0']);
  const decoded=decodeWorldCellFacts(encodeWorldCellFacts(right));assert.deepEqual(decoded,right);
  assert.deepEqual(decoded.layers.regionalBuildings[0].transforms,meshes[0].instanceMatrix.array);
  meshes.forEach(mesh=>{mesh.dispose();mesh.geometry.dispose();});material.dispose();
});

test('far-terrain seam triangle authority is canonical data and survives the worker/JSON boundary exactly',()=>{
 const grid={xValues:[0,1024],zValues:[0,1024],worldYs:Float32Array.of(12,20,12,20),detailedCoverage:[],
  boundaryTriangles:new Map([[0,[[{x:0,y:12,z:0},{x:1024,y:20,z:0},{x:0,y:12,z:1024}]]]])};
 const farMesh={position:{x:0,y:0,z:0},userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array:Float32Array.of(0,12,0,1024,20,0,0,12,1024,1024,20,1024)}},getIndex:()=>null}};
 const snapshot=captureTransportTerrain({terrainGroup:{children:[farMesh]},getFarTerrainSurfaceSnapshot:()=>({grid,portals:[]})});
 assert.ok(Array.isArray(snapshot.far.grid.boundaryTriangles));
 const facts=createWorldCellFacts({requestId:'r',key:'0:0',frame,layers:{terrain:snapshot}});
 const decoded=decodeWorldCellFacts(encodeWorldCellFacts(facts)),restored=restoreTransportTerrain(decoded.layers.terrain);
 assert.equal(restored.sampleTop(100,10),sampleFarFieldGridWorldY(100,10,grid)+.18);restored.dispose();
});
