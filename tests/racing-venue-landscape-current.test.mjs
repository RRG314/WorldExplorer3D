import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RACING_VENUE_SOURCES,createRacingVenueGroundPlan,loadRacingVenueSource,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
const descriptor=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife'),read=url=>fs.readFileSync(new URL('..'+url,import.meta.url),'utf8');
const source=JSON.parse(read(descriptor.sourceUrl));
test('Nord landscape adds bounded coverage probes only inside the retained four native artifacts',()=>{
 const policy=descriptor.landscapeRefinement,manifests=descriptor.groundArtifacts.map(p=>JSON.parse(read(`/app/assets/ground/nordschleife/${p.artifactId}-manifest.json`))),
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
  ground={status:'accepted',artifactIds:descriptor.groundArtifacts.map(p=>p.artifactId),contentSha256s:descriptor.groundArtifacts.map(p=>p.contentSha256)},
  metadata=prepareVenueSourceMerge({},loaded,descriptor,ground).metadata;
 assert.deepEqual(metadata.landscapeRefinement,descriptor.landscapeRefinement);assert.ok(Object.isFrozen(metadata.landscapeRefinement.coverage));
 assert.equal(metadata.venueSource.landscapeRefinement,undefined,'visual policy cannot alter the shared route identity');
 const ordinary=RACING_VENUE_SOURCES[0],normalSource=JSON.parse(read(ordinary.sourceUrl)),normalGround={status:'accepted',artifactIds:[ordinary.groundArtifactId],contentSha256s:[ordinary.groundContentSha256]};
 assert.equal(prepareVenueSourceMerge({},normalSource,ordinary,normalGround).metadata.landscapeRefinement,undefined);
});
