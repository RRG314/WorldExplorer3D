import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {compileMappedVenueLayout,compileMappedVenuePitLayout} from '../app/js/racing/venue-layout.js';
import {RACING_VENUE_SOURCES} from '../app/js/racing/venue-source-packs.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rows=[['spa','spa-grand-prix',30,323851541],['monza','monza-grand-prix',20,38168747],['talladega','talladega-tri-oval',4,116792873]];
test('new circuit and oval sources retain their exact approved recipe digests, full directed loops and separate native pits',()=>{
 for(const [name,id,count,pitId]of rows){
  const bytes=read(`app/assets/racing/${name}/source.json`),source=JSON.parse(bytes),config=JSON.parse(read(`config/racing-venues/${name}-layout.json`)),layout=compileMappedVenueLayout(source),pit=compileMappedVenuePitLayout(source,{pitWayIds:[pitId]},layout);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),config.preparedSourceSha256);assert.equal(source.venueId,id);assert.equal(config.readiness,'source-only');
  assert.deepEqual(source.layout,config.layout);assert.equal(layout.wayIds.length,count);assert.equal(layout.points[0].nodeId,layout.points.at(-1).nodeId);
  assert.ok(Math.abs(layout.lengthDifferenceMeters)/layout.referenceLengthMeters<.01);assert.ok(pit.lengthMeters>700&&pit.lengthMeters<800);
  assert.ok(!layout.wayIds.includes(pitId));assert.ok(source.ways.every(w=>w.uid===undefined&&w.user===undefined&&w.changeset===undefined));
  assert.equal(RACING_VENUE_SOURCES.some(p=>p.id===id),false,'unqualified source-only content must not change world admission');
 }
});
test('the selected GP paths exclude motorcycle, kart and historic alternatives while preserving their source context',()=>{
 const spa=JSON.parse(read('app/assets/racing/spa/source.json')),monza=JSON.parse(read('app/assets/racing/monza/source.json'));
 assert.ok(!spa.layout.wayIds.includes(1134119259)&&spa.ways.some(w=>w.id===1134119259));
 assert.ok(!spa.layout.wayIds.includes(34403881)&&spa.ways.some(w=>w.id===34403881));
 assert.ok(monza.layout.wayIds.includes(179968242)&&!monza.layout.wayIds.includes(38168756));
 assert.ok(monza.layout.wayIds.every(id=>monza.ways.find(w=>w.id===id).tags.historic!=='ruins'));
 assert.ok(monza.ways.some(w=>w.tags.historic==='ruins'));
 assert.ok(monza.layout.wayIds.includes(1443867793),'retain the current mapped covered crossing');
 assert.equal(monza.source.parts.length,4);assert.ok(monza.source.parts.every(p=>/^[a-f0-9]{64}$/.test(p.responseSha256)));
});
