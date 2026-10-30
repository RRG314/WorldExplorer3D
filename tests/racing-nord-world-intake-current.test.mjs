import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RACING_VENUE_SOURCES,racingVenueSourceAt,racingVenueGroundRequirements,loadRacingVenueSource,prepareVenueSourceMerge} from '../app/js/racing/venue-source-packs.js';
import {buildVenueRaceCourses} from '../app/js/racing/venue-courses.js';
import {raceVenueById} from '../app/js/racing/venue-catalog.js';
const pack=RACING_VENUE_SOURCES.find(p=>p.id==='nurburgring-nordschleife'),catalog=JSON.parse(fs.readFileSync(new URL('../app/assets/ground/manifest-catalog.json',import.meta.url)));
test('Nord world inspection uses all four retained ground products while ordinary GP location and unfinished race admission remain separate',async()=>{
 assert.equal(racingVenueSourceAt(pack.anchor),pack);assert.equal(racingVenueSourceAt({lat:50.3356,lon:6.9475}),null);
 const group=racingVenueGroundRequirements(pack);assert.equal(group.length,4);
 for(const item of group){const entry=catalog.manifests.find(m=>m.artifactId===item.artifactId);assert.equal(entry.contentSha256,item.contentSha256);
  assert.ok(fs.existsSync(new URL('../app/assets/ground/'+entry.url,import.meta.url)));assert.equal(entry.verticalDatum,'EGM2008');assert.equal(entry.complete,true);assert.equal(entry.missingSampleCount,0);}
 const source=await loadRacingVenueSource(pack,{fetchImpl:async url=>new Response(fs.readFileSync(new URL('..'+url,import.meta.url)))}),
  prepared=prepareVenueSourceMerge({},source,pack,{status:'accepted',artifactIds:group.map(g=>g.artifactId),contentSha256s:group.map(g=>g.contentSha256)});
 assert.equal(prepared.metadata.sourceFeatureIds.length,53);assert.equal(prepared.metadata.venueSource.sourceFeatureIds.length,53);
 assert.equal(prepared.metadata.raceAdmission,'pending-timing-line');assert.equal(raceVenueById(pack.id).status,'researched');
 assert.throws(()=>buildVenueRaceCourses({roads:[]},prepared.metadata),/timing_line_pending/);
});
