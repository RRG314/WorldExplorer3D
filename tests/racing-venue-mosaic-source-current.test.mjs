import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {osmVenueIntake} from '../scripts/lib/osm-venue-intake.mjs';
import {compileMappedVenueLayout} from '../app/js/racing/venue-layout.js';
import {stageSourceFixture} from './fixtures/racing-stage-source.mjs';
const digest=body=>createHash('sha256').update(body).digest('hex');
function fixture(){
 const source=stageSourceFixture(),nodes=new Map();for(const w of source.ways)w.nodes.forEach((id,i)=>nodes.set(id,{type:'node',id,...w.geometry[i]}));
 const coverage={south:44.99,west:4.99,north:45.01,east:5.02},parts=[],raw=[];
 for(const b of [{...coverage,east:5.005},{...coverage,west:5.005}]){
  const body=JSON.stringify({version:.6,copyright:'OpenStreetMap contributors',bounds:{minlat:b.south,minlon:b.west,maxlat:b.north,maxlon:b.east},elements:[...nodes.values(),...source.ways.map(w=>({type:'way',...w,uid:123,user:'omitted'}))]});
  parts.push({format:'osm-api-map-json-v1',endpoint:`https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.west},${b.south},${b.east},${b.north}`,observedAt:'2026-10-30T12:00:00Z',coverage:b,responseSha256:digest(body)});raw.push({body});
 }
 return {source,metadata:{format:'osm-api-map-bundle-json-v1',coverage,parts},raw:{parts:raw},options:{stageWayIds:[101,102,103]}};
}
test('finite native map parts deduplicate exact ways, preserve stage facts and omit mapper accounts',()=>{
 const f=fixture(),before=JSON.stringify(f.raw),result=osmVenueIntake(f.raw,f.metadata,f.options);
 assert.equal(JSON.stringify(f.raw),before);assert.deepEqual(result.ways.map(w=>w.id),[101,102,103]);assert.ok(result.ways.every(w=>w.user===undefined&&w.uid===undefined));
 assert.deepEqual(compileMappedVenueLayout({...f.source,ways:result.ways}).stage,compileMappedVenueLayout(f.source).stage);
});
test('changed bodies, missing parts, overlap and holes cannot become a complete map source',()=>{
 for(const change of [f=>{f.raw.parts[0].body+=' ';},f=>{f.raw.parts.pop();},f=>{f.metadata.parts[1].coverage.west=5;},
  f=>{f.metadata.coverage.west-=.001;},f=>{f.metadata.parts[0].format='unverified';}]){
  const f=fixture();change(f);assert.throws(()=>osmVenueIntake(f.raw,f.metadata,f.options),/venue_raw_bundle/);
 }
});
test('different revisions or tags of a way in adjacent observations reject the bundle rather than picking a winner',()=>{
 const f=fixture(),body=JSON.parse(f.raw.parts[1].body);body.elements.find(e=>e.id===102).tags.surface='asphalt';
 f.raw.parts[1].body=JSON.stringify(body);f.metadata.parts[1].responseSha256=digest(f.raw.parts[1].body);
 assert.throws(()=>osmVenueIntake(f.raw,f.metadata,f.options),/bundle_way_conflict/);
});
