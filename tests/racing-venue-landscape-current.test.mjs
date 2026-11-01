import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RACING_VENUE_SOURCES,createRacingVenueGroundPlan,loadRacingVenueSource,prepareVenueSourceMerge,racingVenueGroundRequirements} from '../app/js/racing/venue-source-packs.js';
const descriptor=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife'),read=url=>fs.readFileSync(new URL('..'+url,import.meta.url),'utf8');
const source=JSON.parse(read(descriptor.sourceUrl));
test('Nord landscape adds bounded coverage probes only inside the retained native ground group',()=>{
 const policy=descriptor.landscapeRefinement,manifests=racingVenueGroundRequirements(descriptor,{includeLandscape:true}).map(p=>JSON.parse(read(`/app/assets/ground/nordschleife/${p.artifactId}-manifest.json`))),
  bounds={south:Math.min(...manifests.map(p=>p.coverage.south)),north:Math.max(...manifests.map(p=>p.coverage.north)),west:Math.min(...manifests.map(p=>p.coverage.west)),east:Math.max(...manifests.map(p=>p.coverage.east))};
 assert.deepEqual(policy.coverage,bounds);
 const old=createRacingVenueGroundPlan({...descriptor,landscapeRefinement:undefined},source),plan=createRacingVenueGroundPlan(descriptor,source),added=plan.coverageProbes.slice(old.coverageProbes.length);
 assert.ok(added.length>1000);assert.ok(plan.coverageProbes.length<=60000);
 assert.deepEqual(plan.coverageProbes.slice(0,old.coverageProbes.length),old.coverageProbes,'existing physical corridor probes remain identical');
 for(const p of added)assert.ok(manifests.some(m=>p.latitude>=m.coverage.south&&p.latitude<=m.coverage.north&&p.longitude>=m.coverage.west&&p.longitude<=m.coverage.east));
 for(const change of[{radiusMeters:513},{spacingMeters:1},{fullHeightRadiusMeters:400},{coverageFadeMeters:0},{coverage:{...bounds,north:-90}}]){
  assert.throws(()=>createRacingVenueGroundPlan({...descriptor,landscapeRefinement:{...policy,...change}},source),/landscape_policy_invalid/);
 }
});
test('only reviewed venue metadata carries the frozen visual policy; ordinary source preparation is unchanged',async()=>{
 const loaded=await loadRacingVenueSource(descriptor,{fetchImpl:async url=>({ok:true,text:async()=>read(url)})}),
  required=racingVenueGroundRequirements(descriptor,{includeLandscape:true}),ground={status:'accepted',artifactIds:required.map(p=>p.artifactId),contentSha256s:required.map(p=>p.contentSha256)},
  metadata=prepareVenueSourceMerge({},loaded,descriptor,ground).metadata;
 assert.deepEqual(metadata.landscapeRefinement,descriptor.landscapeRefinement);assert.ok(Object.isFrozen(metadata.landscapeRefinement.coverage));
 assert.equal(metadata.groundArtifacts.length,4,'the original physical road and deck proof remains bound to its four unchanged grids');
 assert.equal(metadata.landscapeGroundArtifacts.length,4);
 assert.throws(()=>prepareVenueSourceMerge({},loaded,descriptor,{...ground,artifactIds:ground.artifactIds.slice(0,4)}),/ground_not_ready/);
 assert.equal(metadata.venueSource.landscapeRefinement,undefined,'visual policy cannot alter the shared route identity');
 const ordinary=RACING_VENUE_SOURCES[0],normalSource=JSON.parse(read(ordinary.sourceUrl)),normalGround={status:'accepted',artifactIds:[ordinary.groundArtifactId],contentSha256s:[ordinary.groundContentSha256]};
 assert.equal(prepareVenueSourceMerge({},normalSource,ordinary,normalGround).metadata.landscapeRefinement,undefined);
});

test('new native perimeter hashes, adjoining sample seams and added landscape coverage pass the existing ground authority',async()=>{
 const {compileGroundArtifact}=await import('../app/js/terrain/ground-artifact.js'),{sampleDistrictGroundElevationMeters}=await import('../app/js/world/compiler/district-ground-model.js'),
  {createAcceptedGroundRuntime}=await import('../app/js/terrain/accepted-ground-runtime.js'),{createHash}=await import('node:crypto'),required=racingVenueGroundRequirements(descriptor,{includeLandscape:true}),models=new Map(),manifests=[];
 for(const r of required){
  const manifest=JSON.parse(read(`/app/assets/ground/nordschleife/${r.artifactId}-manifest.json`)),text=read(`/app/assets/ground/nordschleife/${r.artifactId}.json`);
  if(descriptor.landscapeGroundArtifacts.some(p=>p.artifactId===r.artifactId))assert.equal(createHash('sha256').update(text).digest('hex'),r.contentSha256);
  const compiled=compileGroundArtifact({manifest,artifact:JSON.parse(text)});assert.equal(compiled.status,'accepted');models.set(r.artifactId,compiled);manifests.push(manifest);
 }
 const id=name=>name.length===2?'nordschleife-fine-'+name+'-v1':'nordschleife-landscape-'+name+'-v1';
 const pairs=[['north','nw','row'],['north','ne','row'],['south','sw','row'],['south','se','row'],['west','nw','column'],['west','sw','column'],['east','ne','column'],['east','se','column'],['west','north','column'],['west','south','column'],['east','north','column'],['east','south','column']];
 for(const [left,right,axis]of pairs){
  const a=models.get(id(left)).model,b=models.get(id(right)).model,g=a.grid,h=b.grid;
  const minC=Math.max(g.minColumn,h.minColumn),maxC=Math.min(g.maxColumn,h.maxColumn),minR=Math.max(g.minRow,h.minRow),maxR=Math.min(g.maxRow,h.maxRow);
  assert.ok(minC<=maxC&&minR<=maxR);assert.ok(axis==='row'?minR===maxR:minC===maxC);
  for(let row=minR;row<=maxR;row++)for(let column=minC;column<=maxC;column++)assert.ok(Math.abs(sampleDistrictGroundElevationMeters(a,column*4,row*4)-sampleDistrictGroundElevationMeters(b,column*4,row*4))<1e-7,`${left}/${right} seam`);
 }
 const base=createRacingVenueGroundPlan({...descriptor,landscapeRefinement:undefined},source),plan=createRacingVenueGroundPlan(descriptor,source),added=plan.coverageProbes.slice(base.coverageProbes.length),
  runtime=createAcceptedGroundRuntime({loadArtifact:async({manifest})=>models.get(manifest.artifactId)});
 try{
  const accepted=await runtime.prepare({latitude:descriptor.anchor.lat,longitude:descriptor.anchor.lon,manifests,requiredArtifacts:required,coverageProbes:added});
  assert.equal(accepted.status,'accepted');assert.equal(accepted.artifactCount,8);assert.equal(runtime.verifyCoverage(added).status,'accepted');
 }finally{runtime.clear('landscape-boundary-check-complete');}
});
