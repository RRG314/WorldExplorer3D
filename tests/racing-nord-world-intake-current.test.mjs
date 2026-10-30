import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RACING_VENUE_SOURCES,racingVenueSourceAt,racingVenueGroundRequirements,loadRacingVenueSource,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {raceVenueById} from '../app/js/racing/venue-catalog.js';
const pack=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife'),catalog=JSON.parse(fs.readFileSync(new URL('../app/assets/ground/manifest-catalog.json',import.meta.url)));
test('Nord world inspection keeps the ground group, T13 practice and unfinished catalogue distinct from the ordinary GP location',async()=>{
 assert.equal(racingVenueSourceAt(pack.anchor),pack);assert.equal(racingVenueSourceAt({lat:50.3356,lon:6.9475}),null);
 assert.equal(racingVenueGroundRequirements(pack).length,4,'physical source proof remains unchanged');
 const group=racingVenueGroundRequirements(pack,{includeLandscape:true});assert.equal(group.length,8);
 for(const item of group){const entry=catalog.manifests.find(m=>m.artifactId===item.artifactId);assert.equal(entry.contentSha256,item.contentSha256);
  assert.ok(fs.existsSync(new URL('../app/assets/ground/'+entry.url,import.meta.url)));assert.equal(entry.verticalDatum,'EGM2008');assert.equal(entry.complete,true);assert.equal(entry.missingSampleCount,0);}
 const source=await loadRacingVenueSource(pack,{fetchImpl:async url=>new Response(fs.readFileSync(new URL('..'+url,import.meta.url)))}),
  prepared=prepareVenueSourceMerge({},source,pack,{status:'accepted',artifactIds:group.map(g=>g.artifactId),contentSha256s:group.map(g=>g.contentSha256)});
 assert.equal(prepared.metadata.sourceFeatureIds.length,53);assert.equal(prepared.metadata.venueSource.sourceFeatureIds.length,53);
 assert.equal(prepared.metadata.raceAdmission,'practice');assert.equal(raceVenueById(pack.id).status,'researched');
 assert.deepEqual(prepared.metadata.startLine,pack.startLine);assert.equal(prepared.metadata.presentationStatus,'under-construction');
 assert.throws(()=>buildVenueRaceCourses({roads:[]},prepared.metadata),/surface_incomplete/);
});
