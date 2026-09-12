import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStreetPavement, compilePavementTile, meshPavementTile } from '../app/js/world/compiler/street-pavement.js';
import { resolveStreetSection } from '../app/js/world/compiler/street-section.js';
import { linearFeatureVisualSpec } from '../app/js/world/load-style.js';
import { compilePedestrianGraph } from '../app/js/living-world/navigation-graphs.js';
const road = (pts, tags = {}) => ({ width: 8, type: 'residential', pts, transportRecord: { sourceTags: { highway: 'residential', sidewalk: 'both', ...tags } } });
const box = (x0, z0, x1, z1) => ({ pts: [{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}] });
const regionArea = polygons => polygons.reduce((sum, poly) => sum + poly.reduce((s, ring, i) => {
  let a = 0; for (let j = 1; j < ring.length; j++) a += ring[j-1][0]*ring[j][1]-ring[j][0]*ring[j-1][1];
  return s + Math.abs(a)/2*(i ? -1 : 1);
},0),0);
const compile = options => {
  const plan = prepareStreetPavement({ metersPerWorldUnit: 1, ...options });
  return plan.tiles.map(tile => ({ tile, ...compilePavementTile(tile, 1) }));
};
test('explicit feet and inches are converted without discarding units', () => {
  assert.ok(Math.abs(linearFeatureVisualSpec({kind:'footway',subtype:'sidewalk'}, {width:'6 ft'}).width - 1.8288) < 1e-8);
  assert.ok(Math.abs(linearFeatureVisualSpec({kind:'footway'}, {width:`6' 6"`}).width - 1.9812) < 1e-8);
});
test('sidewalk precedence preserves separately mapped and one-sided evidence', () => {
  const section = resolveStreetSection({highway:'residential',sidewalk:'both','sidewalk:left':'separate','sidewalk:right:width':'8 ft'});
  assert.equal(section.left.presence,'separate'); assert.equal(section.right.widthMeters,2.4384);
});
test('eastbound left route is north and samples the shifted surface', () => {
  const feature = road([{x:0,z:0},{x:20,z:0}],{sidewalk:'left'});
  const traversal = {segments:[{feature,segIndex:0,sourceTStart:0,sourceTEnd:1,p1:feature.pts[0],p2:feature.pts[1]}]};
  const g = compilePedestrianGraph({traversal,sampleSurface:(_f,_x,z)=>z}).publication;
  assert.ok(g.edges[0].p1.z < 0); assert.equal(g.edges[0].p1.y,g.edges[0].p1.z+.08);
  feature.transportRecord.sourceTags = {highway:'residential','sidewalk:both':'separate'};
  assert.equal(compilePedestrianGraph({traversal}).publication.edges.length,0);
});
test('intersecting sidewalks form areas with roadway space removed', () => {
  const result = compile({roads:[road([{x:-30,z:0},{x:30,z:0}]),road([{x:0,z:-30},{x:0,z:30}])]});
  const area = result.reduce((s,r)=>s+regionArea(r.polygons),0);
  assert.ok(area>250 && area<432);
  for (const r of result) for (const triangle of meshPavementTile(r.tile,r.polygons,()=>0).triangles) {
    const x=triangle.reduce((s,p)=>s+p.x,0)/3,z=triangle.reduce((s,p)=>s+p.z,0)/3;
    assert.ok(Math.abs(x)>=4-1e-6 && Math.abs(z)>=4-1e-6);
  }
});
test('close continuous frontage is filled but distant lawns remain open', () => {
  const roads=[road([{x:4,z:0},{x:58,z:0}])];
  const plain=compile({roads});
  const frontage=compile({roads,buildings:[box(0,-12,64,-7)]});
  assert.ok(frontage.some(r=>r.inferredFrontages>0));
  assert.ok(frontage.reduce((s,r)=>s+regionArea(r.polygons),0)>plain.reduce((s,r)=>s+regionArea(r.polygons),0));
  const distant=compile({roads,buildings:[box(0,-30,64,-22)]});
  assert.equal(distant.reduce((s,r)=>s+r.inferredFrontages,0),0);
});
test('building footprints exclude pavement', () => {
  const obstacle=box(10,-8,20,-4);
  const result=compile({roads:[road([{x:0,z:0},{x:40,z:0}])],buildings:[obstacle]});
  for(const r of result) for(const tri of meshPavementTile(r.tile,r.polygons,()=>0).triangles) {
    const x=tri.reduce((s,p)=>s+p.x,0)/3,z=tri.reduce((s,p)=>s+p.z,0)/3;
    assert.ok(!(x>10 && x<20 && z>-8 && z< -4));
  }
});
test('global chunk seams use the same slope heights and have no vertical curb on the seam', () => {
  const result=compile({roads:[road([{x:20,z:20},{x:110,z:20}])]});
  const heights=[];
  for(const r of result) {
    const mesh=meshPavementTile(r.tile,r.polygons,(x,z)=>x*.1+z*.03);
    heights.push(...mesh.triangles.flat().filter(p=>Math.abs(p.x-64)<1e-8));
    for(let i=0;i<mesh.curbVertices.length;i+=9) assert.ok(![0,3,6].every(j=>Math.abs(mesh.curbVertices[i+j]-64)<1e-8));
  }
  assert.ok(heights.length>2);
  for(const p of heights) assert.ok(Math.abs(p.y-(p.x*.1+p.z*.03+.108108))<1e-7);
});
test('grade-separated roads do not generate at-grade sidewalk fill', () => {
  const feature=road([{x:0,z:0},{x:40,z:0}]);feature.structureSemantics={terrainMode:'elevated',gradeSeparated:true};
  assert.equal(compile({roads:[feature]}).length,0);
});

test('integer polygon kernel preserves holes and closes near-coincident edges', async () => {
  const { streetPolygonKernel: clip } = await import('../app/js/world/compiler/street-polygon-kernel.js');
  const outer = [[[-1514,-226],[-1512,-226],[-1512,-224],[-1514,-224],[-1514,-226]]];
  const hole = [[[-1513.8,-225.8],[-1513.2,-225.8],[-1513.2,-225.2],[-1513.8,-225.2],[-1513.8,-225.8]]];
  const result = clip.difference(outer,hole);
  assert.equal(result[0].length,2); assert.ok(Math.abs(regionArea(result)-3.64)<1e-6);
  const touching = [[[-1513.775,-225.482],[-1512,-225.482],[-1512,-225],[-1513.775,-225],[-1513.775,-225.48199999999994]]];
  const union = clip.union(result,touching);
  for (const polygon of union) for (const ring of polygon) assert.deepEqual(ring[0],ring.at(-1));
});

test('short building frontages are filled without extending beyond their ends', () => {
  const roads=[road([{x:0,z:0},{x:60,z:0}])];
  const base=compile({roads});
  const filled=compile({roads,buildings:[box(10,-12,20,-7)]});
  const added=filled.reduce((s,r)=>s+regionArea(r.polygons),0)-base.reduce((s,r)=>s+regionArea(r.polygons),0);
  assert.ok(Math.abs(added-12)<.02,`Expected 10m frontage × 1.2m extension, received ${added}`);
});
test('mapped pedestrian areas publish without a neighboring road and retain islands', () => {
  const area={...box(0,0,20,20),tags:{'area:highway':'footway'},holes:[box(5,5,15,15).pts]};
  const result=compile({landuses:[area]});
  assert.equal(result.reduce((s,r)=>s+regionArea(r.polygons),0),300);
});
test('water and parking areas remain excluded from inferred pavement', () => {
  const roads=[road([{x:0,z:0},{x:40,z:0}])];
  const result=compile({roads,landuses:[{...box(10,-8,20,-4),type:'water'},{...box(20,-8,30,-4),type:'parking'}]});
  const base=compile({roads});
  const area=items=>items.reduce((s,r)=>s+regionArea(r.polygons),0);
  assert.ok(Math.abs(area(base)-area(result)-36)<.02);
});
test('resident coverage remains bounded at distant positive and negative world coordinates', () => {
  for(const focus of [-64000,64000]) {
    const bounds={minX:focus-128,maxX:focus+128,minZ:-128,maxZ:128};
    const plan=prepareStreetPavement({roads:[road([{x:focus-10000,z:0},{x:focus+10000,z:0}])],coverageBounds:bounds});
    assert.ok(plan.tiles.length>0 && plan.tiles.length<=16);
    for(const {bounds:b} of plan.tiles) assert.ok(b.minX>=bounds.minX && b.maxX<=bounds.maxX && b.minZ>=bounds.minZ && b.maxZ<=bounds.maxZ);
  }
});
test('wide roads keep walkers outside the carriageway and per-side tags override general absence', () => {
  const feature=road([{x:0,z:0},{x:20,z:0}],{highway:'primary',sidewalk:'no','sidewalk:left':'yes'});feature.width=30;
  const traversal={segments:[{feature,segIndex:0,sourceTStart:0,sourceTEnd:1,p1:feature.pts[0],p2:feature.pts[1]}]};
  const edges=compilePedestrianGraph({traversal}).publication.edges;
  assert.equal(edges.length,2); assert.ok(edges.every(e=>e.p1.z< -15 && e.p2.z< -15));
});

test('regional mapped areas visit only resident cells', () => {
  const start=performance.now();
  const area={...box(-10000000,-10000000,10000000,10000000),tags:{'area:highway':'footway'}};
  const plan=prepareStreetPavement({landuses:[area],coverageBounds:{minX:-128,maxX:128,minZ:-128,maxZ:128}});
  assert.equal(plan.tiles.length,16);
  assert.ok(performance.now()-start<1000);
});
test('sidewalk corners exclude the actual rounded road turn and honor placement offsets', async () => {
  const {roadTurnFootprint}=await import('../app/js/terrain/road-surface-geometry.js?v=2');
  const {streetPolygonKernel:clip}=await import('../app/js/world/compiler/street-polygon-kernel.js');
  const pts=[{x:10,z:10},{x:40,z:10},{x:40,z:40}];
  const feature=road(pts);feature.transportRecord.crossSection={placement:{centerlineOffsetMeters:1}};
  const result=compile({roads:[feature]});
  const joins=roadTurnFootprint({previous:pts[0],point:pts[1],next:pts[2],leftDistance:5,rightDistance:3});
  for(const r of result) for(const join of joins) {
    assert.ok(regionArea(clip.intersection(r.polygons,join))<.01);
  }
  assert.ok(result.some(r=>r.polygons.length));
});

test('captured city tile compiles to finite closed pavement within a bounded budget', async () => {
  const fs=await import('node:fs/promises');
  const tile=JSON.parse(await fs.readFile(new URL('./fixtures/streets/baltimore-city-tile.json',import.meta.url),'utf8'));
  const start=performance.now();
  const result=compilePavementTile(tile);
  const mesh=meshPavementTile(tile,result.polygons,(x,z)=>x*.02+z*.04);
  assert.ok(mesh.triangles.length>0);
  assert.ok(mesh.vertices.every(Number.isFinite));
  for(const poly of result.polygons) for(const ring of poly) assert.deepEqual(ring[0],ring.at(-1));
  assert.ok(performance.now()-start<2000);
});

test('the map request includes ordinary at-grade sidewalks rather than only bridge and tunnel paths',async()=>{
  const {buildWorldOverpassPlan}=await import('../app/js/world/osm-loader.js');
  const plan=buildWorldOverpassPlan({location:{lat:37.793,lon:-122.415},roadsRadius:.015,featureRadiusScale:1,poiRadiusScale:.5,buildingVisibleRadiusWorld:600,overpassTimeoutMs:10000,loadStartedAt:0,maxTotalLoadMs:30000});
  assert.match(plan.primaryQuery,/way\["highway"~"\^\(footway\|pedestrian\|path\|corridor\|steps\|cycleway\)\$"\]\(/);
  assert.match(plan.overpassCacheMeta.kind,/pedestrian-v2/);
});

test('dense captured frontages compile without quadratic touching-polygon repair',async()=>{
  const fs=await import('node:fs/promises');
  const tile=JSON.parse(await fs.readFile(new URL('./fixtures/streets/san-francisco-frontages.json',import.meta.url),'utf8'));
  const start=performance.now();
  const r=compilePavementTile(tile);const mesh=meshPavementTile(tile,r.polygons,()=>0);
  assert.ok(mesh.triangles.length>0);assert.ok(mesh.vertices.every(Number.isFinite));
  assert.ok(performance.now()-start<1500,'This source cell previously spent over ten seconds repairing touching slivers');
});

test('intersection endpoints are trimmed without deleting the walkable sidewalk between them',()=>{
  const feature=road([{x:0,z:0},{x:30,z:0}],{sidewalk:'left'});
  const traversal={segments:[{feature,segIndex:0,sourceTStart:0,sourceTEnd:1,p1:feature.pts[0],p2:feature.pts[1]}]};
  const edges=compilePedestrianGraph({traversal,sampleSurface:(_f,x)=>x*.1,isPedestrianSurface:(x)=>x>=4 && x<=26 && !(x>12 && x<16)}).publication.edges;
  assert.equal(edges.length,4);
  for(const e of edges) {
    assert.ok(e.p1.x>=4 && e.p2.x<=26);
    assert.ok(Math.max(e.p1.x,e.p2.x)<=12 || Math.min(e.p1.x,e.p2.x)>=16);
    assert.ok(Math.abs(e.p1.y-e.p1.x*.1-.08)<1e-7);
  }
});

test('separately mapped sidewalks join bends and fill a close frontage without paving distant lawns',()=>{
  const path={kind:'footway',subtype:'sidewalk',width:2,pts:[{x:2,z:10},{x:40,z:10},{x:40,z:40}]};
  const plain=compile({linearFeatures:[path]});
  const near=compile({linearFeatures:[path],buildings:[box(10,3,30,6)]});
  const far=compile({linearFeatures:[path],buildings:[box(10,-15,30,-10)]});
  const area=result=>result.reduce((s,r)=>s+regionArea(r.polygons),0);
  assert.ok(area(near)>area(plain)+40);
  assert.ok(near.some(r=>r.inferredFrontages>0));
  assert.equal(area(far),area(plain));
  const triangles=near.flatMap(r=>meshPavementTile(r.tile,r.polygons,()=>0).triangles);
  for(const tri of triangles){const x=tri.reduce((s,p)=>s+p.x,0)/3,z=tri.reduce((s,p)=>s+p.z,0)/3;assert.ok(!(x>10&&x<30&&z>3&&z<6));}
});

test('carriageway inference includes mapped parking lanes without counting sidewalks or parking bays',async()=>{
  const {normalizeTransportSource}=await import('../app/js/world/compiler/transport-source-normalizer.js');
  const section=tags=>normalizeTransportSource({id:1},tags).crossSection;
  const base={highway:'residential',lanes:'2','parking:both':'lane','parking:both:orientation':'parallel'};
  assert.equal(section(base).widthMeters,9.8);
  assert.equal(section({...base,width:'12'}).widthMeters,12);
  assert.equal(section({...base,'parking:left':'street_side'}).widthMeters,7.8);
  assert.equal(section({highway:'residential',lanes:'2','parking:lane:both':'parallel'}).widthMeters,9.8);
  assert.equal(section({...base,'parking:both:width':'8 ft'}).widthMeters,10.6768);
  assert.equal(section({...base,'width:carriageway':'11'}).widthMeters,11);
});

test('mapped urban sidewalks connect to a nearby parallel curb, with planting exclusions retained',()=>{
  const path={kind:'footway',subtype:'sidewalk',width:2,pts:[{x:4,z:8},{x:44,z:8}]};
  const r=road([{x:0,z:0},{x:48,z:0}],{sidewalk:'separate'});
  const area=result=>result.reduce((s,p)=>s+regionArea(p.polygons),0);
  const rural=compile({roads:[r],linearFeatures:[path]});
  const urban=compile({roads:[r],linearFeatures:[path],buildings:[box(0,11,48,18)]});
  assert.ok(area(urban)>area(rural)+150);
  const garden={...box(10,4,30,7),type:'garden'};
  const protectedArea=compile({roads:[r],linearFeatures:[path],buildings:[box(0,11,48,18)],landuses:[garden]});
  assert.ok(area(protectedArea)<area(urban)-50);
});

test('mapped crossing paint stays on asphalt and explicit unmarked crossings stay unpainted',()=>{
  const crossing={kind:'footway',subtype:'crossing',width:3,pts:[{x:20,z:-8},{x:20,z:8}],sourceTags:{'crossing:markings':'zebra'}};
  const result=compile({roads:[road([{x:0,z:0},{x:48,z:0}])],linearFeatures:[crossing]});
  assert.ok(result.reduce((s,r)=>s+regionArea(r.markingPolygons),0)>8);
  for(const r of result)for(const poly of r.markingPolygons)for(const ring of poly)for(const [x,z] of ring)assert.ok(x>=18.5 && x<=21.5 && Math.abs(z)<=4.001);
  crossing.sourceTags={'crossing:markings':'no',crossing:'zebra'};
  assert.equal(compile({roads:[road([{x:0,z:0},{x:48,z:0}])],linearFeatures:[crossing]}).reduce((s,r)=>s+regionArea(r.markingPolygons),0),0);
});

test('lowered kerbs ramp down only at source-backed crossings and agree with mesh contact',()=>{
  const crossing={kind:'footway',subtype:'crossing',width:2,pts:[{x:20,z:-8},{x:20,z:8}],sourceTags:{kerb:'lowered'}};
  const result=compile({roads:[road([{x:0,z:0},{x:48,z:0}])],linearFeatures:[crossing]});
  assert.ok(result.some(r=>r.ramps.length));
  const surfaces=result.flatMap(r=>meshPavementTile(r.tile,r.polygons,()=>10,{curbHeight:.12,ramps:r.ramps}).triangles.flat());
  const curb=surfaces.filter(p=>Math.abs(p.x-20)<.01 && Math.abs(Math.abs(p.z)-4)<.01);
  assert.ok(curb.length); assert.ok(curb.every(p=>Math.abs(p.y-10)<1e-6));
  const back=surfaces.filter(p=>Math.abs(p.x-20)<.01 && Math.abs(p.z)>=5.5);
  assert.ok(back.length);assert.ok(back.every(p=>Math.abs(p.y-10.12)<1e-6));
  crossing.sourceTags={};
  assert.ok(compile({roads:[road([{x:0,z:0},{x:48,z:0}])],linearFeatures:[crossing]}).every(r=>r.ramps.length===0));
});

test('reported Baltimore building corner has continuous paving instead of a lowered terrain square',async()=>{
  const {readFile}=await import('node:fs/promises');
  const tile=JSON.parse(await readFile(new URL('./fixtures/streets/baltimore-reported-corner.json',import.meta.url),'utf8'));
  const r=compilePavementTile(tile,1.11);
  const mesh=meshPavementTile(tile,r.polygons,()=>25);
  const point={x:3.7039674333,z:-13.8068811099};
  const supports=mesh.triangles.filter(([a,b,c])=>{
    const d=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    const u=((b.z-c.z)*(point.x-c.x)+(c.x-b.x)*(point.z-c.z))/d;
    const v=((c.z-a.z)*(point.x-c.x)+(a.x-c.x)*(point.z-c.z))/d;
    return u>=0&&v>=0&&u+v<=1;
  });
  assert.ok(supports.length,'the exact raycast point previously exposed terrain');
  assert.ok(supports.flat().every(p=>Math.abs(p.y-25.108108)<1e-6));
});

test('attached urban frontages reach their walls beyond the isolated-house search distance',()=>{
  const r=road([{x:0,z:0},{x:64,z:0}]);
  const attached=[box(4,15,24,25),box(24,15,44,25)];
  const detached=[box(4,15,24,25),box(26,15,44,25)];
  const area=buildings=>compile({roads:[r],buildings}).reduce((s,p)=>s+regionArea(p.polygons),0);
  assert.ok(area(attached)>area(detached)+200);
  const protectedGarden={...box(4,7,44,14),type:'garden'};
  const protectedArea=compile({roads:[r],buildings:attached,landuses:[protectedGarden]}).reduce((s,p)=>s+regionArea(p.polygons),0);
  assert.ok(protectedArea<area(attached)-250);
});

test('frontage and corner coverage is independent of the worker cell boundary',()=>{
  const options={roads:[road([{x:-50,z:0},{x:60,z:0}]),road([{x:32,z:-40},{x:32,z:40}])],buildings:[box(39,10,55,26),box(39,26,55,38)],metersPerWorldUnit:1,coverageBounds:{minX:-64,maxX:64,minZ:-64,maxZ:64}};
  const area=chunkSize=>prepareStreetPavement({...options,chunkSize}).tiles.reduce((sum,t)=>sum+regionArea(compilePavementTile(t,1).polygons),0);
  assert.ok(Math.abs(area(32)-area(64))<.1);
});
