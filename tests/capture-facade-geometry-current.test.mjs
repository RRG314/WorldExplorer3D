import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeEdgeForMesh } from '../app/js/world/building-exterior-details.js';
import { photoWallVerticalScale, captureBuildingContext } from '../app/js/reality-capture/alignment.js';

test('detail width follows each actual facade, not a perpendicular heading', () => {
  for (const angle of [0, .23, Math.PI / 2, 2.1, Math.PI, 4.7]) {
    const rotate = (x,z) => ({x:x*Math.cos(angle)-z*Math.sin(angle),z:x*Math.sin(angle)+z*Math.cos(angle)});
    const pts = [rotate(0,0),rotate(24,0),rotate(24,6),rotate(0,6)];
    const edge = facadeEdgeForMesh({}, {userData:{buildingFootprint:pts}}, rotate(12,0));
    assert.ok(Math.abs(Math.cos(edge.yaw)-edge.tangentX)<1e-12);
    assert.ok(Math.abs(-Math.sin(edge.yaw)-edge.tangentZ)<1e-12);
    // Transform both ends of a cornice exactly as the renderer's Y quaternion.
    for (const sign of [-1,1]) {
      const x=edge.x+sign*edge.length/2*Math.cos(edge.yaw);
      const z=edge.z-sign*edge.length/2*Math.sin(edge.yaw);
      assert.ok(pts.some(p=>Math.hypot(x-p.x,z-p.z)<1e-10));
    }
  }
});

test('full photo walls include the foundation but never cover a pitched roof', () => {
  const building={bodyHeightMeters:8.5,minY:100,maxY:111,roofHeight:2.5};
  assert.equal(photoWallVerticalScale(building,8),8.5/8);
  assert.equal(photoWallVerticalScale({...building,bodyHeightMeters:undefined},8),8.5/8);
  assert.equal(photoWallVerticalScale({},8),1);
  assert.equal(photoWallVerticalScale(building,null),1);
  const region=[.25,.75], scale=photoWallVerticalScale(building,8);
  assert.deepEqual(region.map(v=>v*8*scale),region.map(v=>v*8.5));
  const snapshot=captureBuildingContext({...building,pts:[{x:0,z:0},{x:4,z:0},{x:4,z:4}]});
  assert.equal(snapshot.wallHeightMeters,8.5);
});
