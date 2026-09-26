import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareCarriagewayTiles,unionCarriageway} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {prepareStreetPavement,compilePavementTile} from '../app/js/world/compiler/street-pavement.js';
import {streetPolygonKernel as clip} from '../app/js/world/compiler/street-polygon-kernel.js';
import {createPavementTerrainPartition} from '../app/js/world/pavement-terrain-partition.js';

const area=polys=>polys.reduce((sum,poly)=>sum+poly.reduce((total,ring,j)=>total+(j?-1:1)*Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2,0),0);
const road=(pts,extra={})=>({pts:pts.map(([x,z])=>({x,z})),width:4,type:'residential',tags:{sidewalk:'both'},structureSemantics:{terrainMode:'at_grade'},...extra});
const cross=[road([[-20,0],[20,0]]),road([[0,-20],[0,20]])];
const flatten=tiles=>tiles.flatMap(tile=>unionCarriageway(tile));
const triangleArea=mesh=>{let sum=0;const p=mesh.positions;for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=Array.from(mesh.indices.slice(i,i+3),n=>n*3);sum+=Math.abs((p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a]))/2;}return sum;};

test('cross junction has one top, exact width and no stacked cap area',()=>{
  const tiles=prepareCarriagewayTiles(cross,16);
  assert.ok(Math.abs(area(flatten(tiles))-304)<1e-7);
  let meshedArea=0;
  for(const tile of tiles)meshedArea+=triangleArea(meshCarriagewayTile(tile,(x,z)=>x*.2+z*.1,(vertices)=>vertices));
  assert.ok(Math.abs(meshedArea-304)<1e-6,'triangles must cover the union exactly once');
});

test('source duplication, ordering and compiler cell sizes preserve footprint',()=>{
  for(const size of [16,32,128]) {
    assert.ok(Math.abs(area(flatten(prepareCarriagewayTiles([...cross].reverse().concat(cross),size)))-304)<1e-7);
  }
});

test('elevated crossing remains independent from at-grade ownership',()=>{
  const elevated=road([[0,-20],[0,20]],{structureSemantics:{terrainMode:'elevated',gradeSeparated:true}});
  assert.equal(area(flatten(prepareCarriagewayTiles([cross[0],elevated],16))),160);
});

test('pavement and rendered carriageway use the same boundary at acute turns and placement offsets',()=>{
  const roads=[road([[-24,-8],[0,0],[24,12]],{metersPerWorldUnit:1,transportRecord:{crossSection:{placement:{centerlineOffsetMeters:1}}}}),road([[0,-24],[0,24]])];
  const rendered=flatten(prepareCarriagewayTiles(roads,32));
  const prepared=prepareStreetPavement({roads,metersPerWorldUnit:1,chunkSize:32});
  for(const tile of prepared.tiles) {
    const pavement=compilePavementTile(tile,1).polygons;
    assert.ok(area(clip.intersection(pavement,rendered))<.005,'pavement must not cover asphalt');
  }
});

function grid() {
  const array=new Float32Array([-16,0,-16, 0,2,-16, 16,0,-16, -16,0,0, 0,2,0, 16,0,0, -16,0,16, 0,2,16, 16,0,16]);
  return {visible:true,userData:{isTerrainMesh:true},position:{x:0,z:0},geometry:{parameters:{widthSegments:2},attributes:{position:{array,getX:i=>array[i*3],getZ:i=>array[i*3+2]}}}};
}
test('partition preserves a terrain crest inside a road triangle',()=>{
  const partition=createPavementTerrainPartition([grid()]);
  const sample=x=>2-Math.abs(x)/8+.18;
  const result=partition([-12,sample(-12),-10,12,sample(12),-10,0,sample(0),10],sample);
  assert.ok(result?.length>9);
  for(let i=0;i<result.length;i+=3)assert.ok(Math.abs(result[i+1]-sample(result[i]))<1e-9);
  assert.ok(result.some((v,i)=>i%3===0&&Math.abs(v)<1e-9),'must retain crest vertices');
  partition.dispose();
});

test('far terrain participates in exact support and missing support fails explicitly',()=>{
  const array=new Float32Array([0,0,0,128,12.8,0,0,0,128,128,12.8,128]);
  const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array}},getIndex:()=>({array:new Uint16Array([0,2,1,1,2,3])})}};
  const partition=createPavementTerrainPartition([far],{includeFarTerrain:true});
  const tile=prepareCarriagewayTiles([road([[8,64],[120,64]])])[0];
  const mesh=meshCarriagewayTile(tile,x=>x*.1+.18,partition);
  assert.ok(Math.abs(triangleArea(mesh)-448)<1e-4);
  assert.throws(()=>meshCarriagewayTile(tile,()=>0,()=>null),/incomplete or overlapping terrain support/);
  partition.dispose();
});

test('production publisher cannot reintroduce per-road ground sheets or circular caps',async()=>{
  const source=await readFile(new URL('../app/js/terrain/rebuild.js',import.meta.url),'utf8');
  const publisher=source.slice(source.indexOf('export async function publishCompiledTransportMeshes'));
  assert.doesNotMatch(publisher,/appendSolidAtGradeRoadGeometry\(|appendCompactIntersectionCap\(/);
  assert.match(publisher,/meshCarriagewayTile\(/);
});

test('translated near tiles and world-coordinate far mesh share Float32 boundary precision',()=>{
  const near=grid();near.position.x=2048.123456;
  const boundary=near.position.x+16,farEdge=Math.fround(boundary);
  const array=new Float32Array([farEdge,0,-16,farEdge+16,0,-16,farEdge,0,16,farEdge+16,0,16]);
  const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array}},getIndex:()=>({array:new Uint16Array([0,2,1,1,2,3])})}};
  const partition=createPavementTerrainPartition([near,far],{includeFarTerrain:true});
  const vertices=[boundary-4,0,-4,boundary+4,0,-4,boundary,0,4];
  assert.ok(partition(vertices,()=>0),'same rendered boundary must not create a missing support sliver');
  assert.ok(Math.abs(partition.lastCoverage.difference)<1e-7);
  partition.dispose();
});

test('road triangulation omits redundant grid cuts without changing the rendered terrain surface',async()=>{
  const {meshPavementTile}=await import('../app/js/world/compiler/street-pavement.js');
  const {createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js');
  const p=new Float32Array([0,0,0,128,12.8,0,0,0,128,128,12.8,128]);
  const far={visible:true,userData:{isFarTerrainClipmap:true},geometry:{attributes:{position:{array:p}},getIndex:()=>({array:new Uint16Array([0,2,1,1,2,3])})}};
  const partition=createPavementTerrainPartition([far],{includeFarTerrain:true});
  const tile=prepareCarriagewayTiles([road([[8,64],[120,64]])])[0],sample=x=>x*.1+.18;
  const previous=partition(meshPavementTile(tile,unionCarriageway(tile),sample,{cellSize:32,curbHeight:0,includeCurbs:false,includeTriangles:false}).vertices,sample);
  const current=meshCarriagewayTile(tile,sample,partition);
  assert.ok(current.indices.length/3<previous.length/9/2,`new ${current.indices.length/3}, previous ${previous.length/9}`);
  assert.ok(Math.abs(triangleArea(current)-448)<1e-4);
  const contact=createRoadContactIndex([{geometry:{attributes:{position:{array:current.positions}},getIndex:()=>({array:current.indices})}}]);
  for(let x=8.1;x<120;x+=1.73)for(const z of [62.1,63,64,65.9])assert.ok(Math.abs(contact.sampleAt(x,z)-sample(x))<1e-5);
  contact.dispose();partition.dispose();
});

test('removing the intermediate road grid retains a sharp terrain crest and contact on both sides',async()=>{
  const {createRoadContactIndex}=await import('../app/js/terrain/road-contact-index.js');
  const partition=createPavementTerrainPartition([grid()]),sample=x=>2-Math.abs(x)/8+.18;
  const meshes=prepareCarriagewayTiles([road([[-12,0],[12,0]])]).map(tile=>meshCarriagewayTile(tile,sample,partition));
  const contact=createRoadContactIndex(meshes.map(m=>({geometry:{attributes:{position:{array:m.positions}},getIndex:()=>({array:m.indices})}})));
  for(let x=-11.9;x<12;x+=.13)for(const z of [-1.9,0,1.9])assert.ok(Math.abs(contact.sampleAt(x,z)-sample(x))<1e-5);
  assert.ok(Math.abs(contact.sampleAt(0,0)-2.18)<1e-5);
  contact.dispose();partition.dispose();
});
