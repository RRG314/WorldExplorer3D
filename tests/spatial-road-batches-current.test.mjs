import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialRoadBatches } from '../app/js/terrain/spatial-road-batches.js';
import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js';

const surface = (x, z, y, mode = 'at_grade') => ({
  verts: [x,y,z, x,y,z+10, x+10,y,z], indices: [0,1,2], mode
});
const triangles = batches => batches.flatMap(batch => batch.ranges.flatMap(range => {
  const result=[];
  for(let i=range.start;i<range.start+range.count;i+=3) result.push(JSON.stringify({
    points:batch.indices.slice(i,i+3).map(index=>batch.verts.slice(index*3,index*3+3)), mode:range.terrainMode
  }));
  return result;
})).sort();
const originalBatches = surfaces => surfaces.map(s=>({verts:s.verts,indices:s.indices,ranges:[{start:0,count:s.indices.length,terrainMode:s.mode}]}));
const build = (surfaces, options) => {
  const builder=createSpatialRoadBatches(options);
  for(const s of surfaces)builder.append(s.verts,s.indices,s.mode);
  builder.finish();return builder.batches;
};
const contacts = batches => createRoadContactIndex(batches.map(b=>({
  geometry:{attributes:{position:{array:new Float32Array(b.verts)}},getIndex:()=>({array:new Uint32Array(b.indices)})},
  userData:{surfaceRanges:b.ranges}
})));

test('interleaved regional surfaces preserve every triangle and surface mode across bounded batches',()=>{
  const inputs=[surface(0,0,3),surface(10000,10000,9),surface(20,0,4),surface(-10000,-10000,8),surface(40,0,11,'elevated'),surface(0,0,15,'elevated')];
  const snapshot=structuredClone(inputs);
  const output=build(inputs,{maxVertices:6});
  assert.deepEqual(triangles(output),triangles(originalBatches(inputs)));
  assert.deepEqual(inputs,snapshot);
  assert.ok(output.every(b=>b.verts.length/3<=6));
  assert.deepEqual(build(inputs,{maxVertices:6}),output,'publication order is deterministic');
});

test('far surfaces no longer expand nearby render bounds and crossing geometry stays intact',()=>{
  const inputs=[surface(0,0,3),surface(10000,10000,9),surface(1019,0,4)];
  const output=build(inputs);
  const near=output.find(b=>b.verts.includes(0));
  assert.ok(Math.max(...near.verts.filter((_,i)=>i%3===0))<2000);
  assert.deepEqual(triangles(output),triangles(originalBatches(inputs)),'a source crossing a spatial boundary is not clipped or subdivided');
});

test('collision support and stacked surface selection are identical after regrouping',()=>{
  const inputs=[surface(0,0,3),surface(10000,10000,9),surface(0,0,15,'elevated'),surface(-10000,-10000,-2)];
  const before=contacts(originalBatches(inputs)),after=contacts(build(inputs));
  try {
    for(const [x,z,mode,expected]of [[1,1,'at_grade',3],[1,1,'elevated',15],[10001,10001,'at_grade',9],[-9999,-9999,'at_grade',-2]]){
      assert.equal(before.sampleAt(x,z,NaN,mode),expected);
      assert.equal(after.sampleAt(x,z,NaN,mode),expected);
    }
    assert.equal(after.sampleAt(5000,5000,NaN,'at_grade'),null,'regrouping does not create physical support in a gap');
  } finally {before.dispose();after.dispose();}
});
