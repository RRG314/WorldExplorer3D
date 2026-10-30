import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {osmVenueIntake} from '../scripts/lib/osm-venue-intake.mjs';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),text=read('app/assets/racing/daytona/source.json'),source=JSON.parse(text),config=JSON.parse(read('config/racing-venues/daytona-layout.json'));

test('the retained Daytona tri-oval closes through five exact source ways without the chicane, road course or pit shortcuts',()=>{
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),'6add37bd68a3f9c6c8fc7aaad4da0ecd47d024b959add83b366065842247c773');
 const layout=compileMappedVenueLayout(source);assert.equal(source.ways.length,26);assert.deepEqual(layout.wayIds,[11371365,352067004,352070311,352070309,352070316]);
 assert.equal(layout.points[0].nodeId,layout.points.at(-1).nodeId);assert.ok(Math.abs(layout.lengthMeters-4017.9259386857275)<1e-7);
 assert.ok(Math.abs(layout.lengthDifferenceMeters+5.43406131427264)<1e-7);assert.deepEqual(source.source, {...config.source,recipe:'scripts/racing/build-venue-source.mjs'});
 assert.ok(source.ways.every(w=>!Object.hasOwn(w,'user')&&!Object.hasOwn(w,'uid')&&!Object.hasOwn(w,'changeset')));
 const chicane=structuredClone(source);chicane.layout.wayIds[3]=198466856;
 assert.notDeepEqual(compileMappedVenueLayout(chicane).wayIds,config.layout.wayIds,'a nearby-length alternative cannot establish the pinned layout identity');
 assert.deepEqual(source.layout,config.layout);
 const missing=structuredClone(source);missing.layout.wayIds.splice(2,1);assert.throws(()=>compileMappedVenueLayout(missing),/disconnected/);
 const descriptor=RACING_VENUE_SOURCES.find(s=>s.id===source.venueId);
 assert.equal(descriptor.sourceSha256,crypto.createHash('sha256').update(text).digest('hex'));
 assert.equal(descriptor.raceAdmission,'pending-timing-line','source intake must not enable the unfinished oval');
});
function nativeFixture(){
 const way=source.ways.find(w=>w.id===11371365),nodes=way.nodes.map((id,i)=>({type:'node',id,...way.geometry[i],uid:123,user:'omitted mapper'}));
 return {version:'0.6',copyright:'OpenStreetMap and contributors',bounds:{minlat:29.175,minlon:-81.087,maxlat:29.197,maxlon:-81.055},elements:[...nodes,{type:'way',...way,geometry:undefined,uid:123,user:'omitted mapper'}]};
}
test('native API intake resolves complete real node geometry and retains observation semantics without mapper accounts',()=>{
 const raw=nativeFixture(),before=JSON.stringify(raw),result=osmVenueIntake(raw,config.source);
 assert.deepEqual(result.snapshot,{observedAt:config.source.observedAt});assert.equal(result.snapshot.osmBase,undefined);
 assert.deepEqual(result.ways[0],source.ways.find(w=>w.id===11371365));assert.equal(JSON.stringify(raw),before);
 const missing=structuredClone(raw);missing.elements.shift();assert.throws(()=>osmVenueIntake(missing,config.source),/incomplete_way/);
 const duplicate=structuredClone(raw);duplicate.elements.push({...duplicate.elements[0]});assert.throws(()=>osmVenueIntake(duplicate,config.source),/source_node/);
 const coverage=structuredClone(raw);coverage.bounds.minlat-=.01;assert.throws(()=>osmVenueIntake(coverage,config.source),/source_coverage/);
 for(const change of [{observedAt:undefined},{format:'guessed-map'},{endpoint:'https://example.invalid/map.json?bbox='}])assert.throws(()=>osmVenueIntake(raw,{...config.source,...change}),/source_format/);
});
test('the existing Overpass format retains the exact Silverstone source ways and replication-base semantics',()=>{
 const silverstone=JSON.parse(read('app/assets/racing/silverstone/source.json')),raw={osm3s:{timestamp_osm_base:silverstone.source.osmBase},elements:silverstone.ways.map(w=>({type:'way',...w,uid:123,user:'omitted mapper'}))},result=osmVenueIntake(raw,silverstone.source);
 assert.deepEqual(result.ways,silverstone.ways);assert.deepEqual(result.snapshot,{osmBase:silverstone.source.osmBase});
 assert.throws(()=>osmVenueIntake({...raw,osm3s:{}},silverstone.source),/source_snapshot/);
});
