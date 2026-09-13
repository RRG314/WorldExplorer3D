import test from 'node:test';
import assert from 'node:assert/strict';
import { conformPavementMesh } from '../app/js/world/pavement-terrain-conformance.js';
import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js';

function meshFor(ground) {
  const p=[0,ground(0,0)+.12,0],q=[4,ground(4,0)+.12,0];
  const a=[0,ground(0,4)+.12,4],b=[4,ground(4,4)+.12,4];
  const lowP=[0,p[1]-.12,0],lowQ=[4,q[1]-.12,0];
  return {vertices:[...p,...a,...b,...p,...b,...q],curbVertices:[...p,...lowP,...lowQ,...p,...lowQ,...q]};
}

test('planar sidewalks retain their original triangle count on a steep slope',()=>{
  const ground=(x,z)=>3000+x*.5-z*.3,mesh=meshFor(ground);
  assert.equal(conformPavementMesh(mesh,ground,(x,z)=>ground(x,z)+.12),0);
  assert.equal(mesh.vertices.length,18);assert.equal(mesh.curbVertices.length,18);
});
for(const direction of [1,-1])test(`curved terrain ${direction>0?'rise':'hollow'} refines paving and curb with matching support`,()=>{
  const ground=(x,z)=>direction*Math.sin(x*Math.PI/4)*1.5;
  const mesh=meshFor(ground);
  assert.ok(conformPavementMesh(mesh,ground,(x,z)=>ground(x,z)+.12)>0);
  assert.ok(mesh.curbVertices.length>18);
  const index=createRoadContactIndex([{geometry:{attributes:{position:{array:new Float32Array(mesh.vertices)}}}}],4);
  for(let x=.1;x<4;x+=.2)for(let z=.1;z<4;z+=.4){
    assert.ok(Math.abs(index.sampleAt(x,z)-(ground(x,z)+.12))<.035);
    assert.ok(index.sampleAt(x,z)>ground(x,z));
  }
  for(let i=0;i<mesh.curbVertices.length;i+=18){
    const v=mesh.curbVertices;
    assert.ok(Math.abs(index.sampleAt(v[i],v[i+2])-v[i+1])<1e-6);
  }
  index.dispose();assert.equal(index.sampleAt(2,2),null);
});
