import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadRacingVenueSource,prepareVenueSourceMerge,RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
import {roadSourceSurvey} from '../app/js/world/road-source-survey.js';
import {adaptSelectedLocationSource} from '../app/js/world/compiler/selected-location-source-adapter.js';
import {reviewedDeckSurveyInWorld} from '../app/js/world/reviewed-deck-world-profile.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const config=JSON.parse(read('config/racing-venues/nordschleife-decks.json')),
 sourceText=read(config.sourceFile),profileText=read('app/assets/racing/nordschleife/decks.json'),artifact=JSON.parse(profileText);
const descriptor={id:config.venueId,name:'Nordschleife',sourceUrl:'/app/assets/racing/nordschleife/source.json',sourceSha256:config.sourceSha256,
 pavementWidthPolicy:'mapped',surfaceModel:'banked-road-v1',maximumCrossfall:.7,groundArtifacts:config.groundArtifacts,
 groundArtifactId:config.groundArtifacts[0].artifactId,groundContentSha256:config.groundArtifacts[0].contentSha256,
 reviewedDeckProfiles:{url:'/app/assets/racing/nordschleife/decks.json',contentSha256:hash(profileText)}};
const ground={status:'accepted',artifactIds:config.groundArtifacts.map(a=>a.artifactId),contentSha256s:config.groundArtifacts.map(a=>a.contentSha256)};
const fetcher=text=>async url=>new Response(url===descriptor.sourceUrl?sourceText:text);

test('the pinned Nord deck artifact reaches private world-source ownership and the existing geographic conversion',async()=>{
 assert.equal(hash(sourceText),config.sourceSha256);
 assert.equal(hash(profileText),'e906c286f3a856914a91ee3650d7c02e8d8d8bb0482c772a55326b4fe10898c8');
 assert.equal(hash(read(config.normalizedObservations.file)),config.normalizedObservations.sha256);
 assert.equal(artifact.bridges.length,5);assert.equal(artifact.bridges.reduce((n,b)=>n+b.samples.length,0),167);
 const source=await loadRacingVenueSource(descriptor,{fetchImpl:fetcher(profileText)});
 assert.equal(JSON.stringify(source),JSON.stringify(JSON.parse(sourceText)),'the review annotation never becomes provider/cache JSON');
 const prepared=prepareVenueSourceMerge({},source,descriptor,ground),nodes={};
 for(const node of prepared.data.elements.filter(e=>e.type==='node'))nodes[node.id]=node;
 const normalized=adaptSelectedLocationSource({data:prepared.data,location:{lat:50.359,lon:6.963},nodes,
  selection:{roadWays:prepared.data.elements.filter(e=>e.type==='way'),buildingWays:[],landuseWays:[],poiNodes:[]}});
 const frame=earthCoordinateFrame({lat:50.359,lon:6.963},100000);
 for(const bridge of artifact.bridges){
  const way=normalized.selection.roadWays.find(w=>Number(w.id)===bridge.sourceWayId),survey=roadSourceSurvey(way),deck=survey.geographicDeckProfile;
  assert.equal(deck.contentSha256,descriptor.reviewedDeckProfiles.contentSha256);assert.equal(deck.observedCoreWidthMeters,4);assert.equal(deck.reconstructedWidthMeters,bridge.reconstructedWidthMeters);
  assert.ok(Object.isFrozen(deck.samples[0].positiveNormal));
  const original=JSON.parse(sourceText).ways.find(w=>w.id===bridge.sourceWayId),points=original.geometry.map(p=>frame.toWorld(p.lat,p.lon));
  const converted=reviewedDeckSurveyInWorld(survey,points,{geoToWorld:(lat,lon)=>frame.toWorld(lat,lon),heightToWorld:y=>y*100000/111000});
  assert.equal(converted.deckProfile.contentSha256,deck.contentSha256);assert.equal(converted.geographicDeckProfile,undefined);
  assert.equal(converted.deckProfile.samples.length,bridge.samples.length);
 }
 assert.throws(()=>prepareVenueSourceMerge({},JSON.parse(JSON.stringify(source)),descriptor,ground),/not_prepared/);
 assert.equal(RACING_VENUE_SOURCES.some(s=>s.id===config.venueId),false,'supporting source data alone cannot enable the unfinished venue');
});

test('changed source identity, geometry, width, station coverage or ground cannot acquire deck authority even under a new content hash',async()=>{
 const changes=[
  a=>a.sourceSha256='a'.repeat(64),a=>a.bridges.pop(),a=>a.bridges[0].sourceVersion++,a=>a.bridges[0].nodeIds.reverse(),
  a=>a.bridges[0].reconstructedWidthMeters++,a=>a.bridges[0].observedCoreWidthMeters=20,
  a=>a.bridges[0].maximumCoreResidualMeters=.051,a=>a.bridges[0].samples[0].latitude+=.001,
  a=>a.bridges[0].samples[0].heightMetersEgm2008=null,a=>a.bridges[0].samples[0].positiveNormal={...a.bridges[0].samples[0]},
  a=>a.bridges[0].samples.splice(1,3),a=>a.bridges[0].samples[1].fraction=0,
  a=>a.groundArtifacts[0].contentSha256='f'.repeat(64),a=>a.normalization.direction='forward'
 ];
 for(const change of changes){const value=structuredClone(artifact);change(value);const text=JSON.stringify(value),entry={...descriptor,reviewedDeckProfiles:{...descriptor.reviewedDeckProfiles,contentSha256:hash(text)}};
  await assert.rejects(loadRacingVenueSource(entry,{fetchImpl:fetcher(text)}),/deck_source_invalid/);
 }
});

test('the source loader rejects failed, changed, cancelled and non-asset profile requests',async()=>{
 await assert.rejects(loadRacingVenueSource(descriptor,{fetchImpl:fetcher(profileText+' ')}),/integrity_failed/);
 await assert.rejects(loadRacingVenueSource(descriptor,{fetchImpl:async url=>url===descriptor.sourceUrl?new Response(sourceText):new Response('',{status:404})}),/fetch_failed/);
 const controller=new AbortController();
 await assert.rejects(loadRacingVenueSource(descriptor,{signal:controller.signal,fetchImpl:async url=>{if(url!==descriptor.sourceUrl)controller.abort();return new Response(url===descriptor.sourceUrl?sourceText:profileText);}}),e=>e.name==='AbortError');
 for(const url of ['/app/assets/racing/../private.json','https://example.test/profiles.json']){
  await assert.rejects(loadRacingVenueSource({...descriptor,reviewedDeckProfiles:{...descriptor.reviewedDeckProfiles,url}},{fetchImpl:fetcher(profileText)}),/descriptor_invalid/);
 }
 const source=JSON.parse(sourceText);source.reviewedDeckProfiles=artifact;
 await assert.rejects(loadRacingVenueSource(descriptor,{fetchImpl:fetcher('x')}),/integrity_failed/);
 assert.throws(()=>prepareVenueSourceMerge({},source,descriptor,ground),/not_prepared/);
});
