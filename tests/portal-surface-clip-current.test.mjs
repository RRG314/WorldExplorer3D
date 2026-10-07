import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalSurfaceClipper} from '../app/js/terrain/portal-surface-clip.js';
import {terrainPointRemovedByPortal} from '../app/js/terrain/structure-terrain-portals.js?v=2';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';

const mask={x:0,z:0,tangentX:1,tangentZ:0,roadY:0,grade:0,halfWidth:2,halfDepth:5,cutHeight:10};
const square=y=>Float32Array.from([-10,y,-10,10,y,-10,-10,y,10,10,y,10]);
const indices=Uint32Array.from([0,2,1,1,2,3]);
function area({positions:p,indices:ix}) {
  let result=0;
  for(let i=0;i<ix.length;i+=3) {
    const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
    const twice=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);
    assert.ok(twice>0,'cut preserves upward non-degenerate faces');result+=twice/2;
  }return result;
}
const contact=mesh=>createRoadContactIndex([{geometry:{attributes:{position:{array:mesh.positions}},getIndex:()=>({array:mesh.indices})},userData:{terrainMode:'at_grade'}}]);

test('excavations remove precisely their footprint from both asphalt and its collision floor',()=>{
  const source=square(5),copy=source.slice(),cut=createPortalSurfaceClipper([mask])(source,indices);
  assert.equal(area(cut),360);assert.deepEqual(source,copy);
  const index=contact(cut);
  assert.equal(index.sampleAt(0,0),null);assert.equal(index.sampleAt(6,0),5);assert.equal(index.sampleAt(0,3),5);
  index.dispose();
});
test('overlapping rotated and sloped cuts match the terrain volume, without double-removing overlap',()=>{
  const a={...mask},b={...mask,x:3};
  const clip=createPortalSurfaceClipper([a,b]);
  const cut=clip(square(5),indices);assert.equal(area(cut),348);
  assert.equal(area(clip(cut.positions,cut.indices)),348);
  const rotated={...mask,tangentX:Math.SQRT1_2,tangentZ:Math.SQRT1_2,grade:.8,roadY:5,cutHeight:3};
  const slopeCut=createPortalSurfaceClipper([rotated])(square(5),indices),index=contact(slopeCut);
  for(let x=-9.87;x<9;x+=.51)for(let z=-9.93;z<9;z+=.47) {
    assert.equal(index.sampleAt(x,z)===null,terrainPointRemovedByPortal(rotated,{x,y:5,z}),`volume mismatch ${x},${z}`);
  }index.dispose();
});
test('upper crossings, lower floors, untouched regions and absent cuts retain original geometry',()=>{
  for(const y of [-1,11]) {
    const positions=square(y),cut=createPortalSurfaceClipper([mask])(positions,indices);
    assert.equal(cut.positions,positions);assert.equal(cut.indices,indices);
  }
  const positions=square(5);
  assert.equal(createPortalSurfaceClipper([{...mask,x:1000}])(positions,indices).positions,positions);
  assert.equal(createPortalSurfaceClipper([])(positions,indices).positions,positions);
});
test('unindexed pavement and curb faces use the same cut and preserve surviving vertical area',()=>{
  const p=new Float32Array([-8,1,0,8,1,0,-8,6,0,8,1,0,8,6,0,-8,6,0]);
  const cut=createPortalSurfaceClipper([mask])(p);
  assert.equal(cut.indices,null);assert.ok(cut.positions.length>0);
  for(let i=0;i<cut.positions.length;i+=9){
    const x=(cut.positions[i]+cut.positions[i+3]+cut.positions[i+6])/3;
    assert.ok(Math.abs(x)>=5);
  }
});
