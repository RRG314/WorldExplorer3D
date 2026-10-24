import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';
import {getWeeklyFeaturedCity,weeklyRoomDescriptor,weeklyRoomCode} from '../app/js/multiplayer/featured-city-model.js';
import {buildWeeklyRoomModel} from '../scripts/build-weekly-room-model.mjs';
const server=createRequire(import.meta.url)('../functions/generated/weekly-room-model.cjs');
test('one UTC ISO week has one city/code across time zones; year rollover has a new identity',()=>{
 const a=weeklyRoomDescriptor(new Date('2026-10-26T00:01:00Z')),b=weeklyRoomDescriptor(new Date('2026-10-25T20:01:00-04:00'));
 assert.deepEqual(a,b);assert.equal(a.weekKey,'2026-W44');assert.notEqual(a.code,weeklyRoomDescriptor(new Date('2026-10-25T23:59:59Z')).code);
 assert.equal(weeklyRoomDescriptor(new Date('2021-01-01T12:00:00Z')).weekKey,'2020-W53');
 assert.notEqual(weeklyRoomCode({year:2026,week:1}),weeklyRoomCode({year:2027,week:1}));
 const codes=new Set();for(let year=2000;year<2100;year++)for(let week=1;week<=53;week++){const code=weeklyRoomCode({year,week});assert.match(code,/^W[A-Z0-9]{5}$/);assert.ok(!codes.has(code));codes.add(code);}
});
test('every rotated city has canonical coordinates and browser/server descriptors agree',()=>{
 for(let week=0;week<54;week++){const date=new Date(Date.UTC(2026,0,5+week*7));const city=getWeeklyFeaturedCity(date);assert.ok(Number.isFinite(city.lat)&&Number.isFinite(city.lon));assert.deepEqual(server.weeklyRoomDescriptor(date),weeklyRoomDescriptor(date));}
});
test('generated server weekly rules are current',async()=>{
 const built=await buildWeeklyRoomModel({write:false});assert.equal(Buffer.from(built.outputFiles[0].contents).toString(),await readFile('functions/generated/weekly-room-model.cjs','utf8'));
});
