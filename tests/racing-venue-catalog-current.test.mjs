import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prepareRacingVenueIntake} from '../scripts/racing/intake-venue-catalog.mjs';
import {publishPreparedRacingDistrict} from '../scripts/racing/intake-district.mjs';
import {raceDistrictChunkPath} from '../app/js/racing/district-storage.js';
import {readPublishedRaceCourse,assertRaceCourseInDistrict} from '../app/js/racing/publication-rules.js';
import {createRaceVehicleProfile} from '../app/js/racing/vehicle-controller.js';
import {racePhysicsVersion} from '../app/js/racing/record-rules.js';
import {raceCourseProjection,resolveRaceCourseProjection} from '../app/js/racing/course-projection.js';
import {createRequire} from 'node:module';
import {createRaceServer} from '../services/racing/transport.mjs';
import {createRaceConnection} from '../app/js/racing/network-client.js';
const input=async slug=>JSON.parse(await fs.readFile(new URL(`../config/racing-venues/catalog/${slug}.json`,import.meta.url),'utf8'));

for (const [slug, roads, length] of [
  ['silverstone', 589, 5870],
  ['nordschleife', 1081, 20710],
  ['daytona', 139, 4011],
]) {
  test(`reviewed ${slug} catalogue reconstructs all three offered event durations through the actual authority contract`, async () => {
    const raw = await input(slug),
      { prepared, courses } = await prepareRacingVenueIntake(raw);
    assert.equal(prepared.facts.roads.length, roads);
    assert.equal(courses.length, 3);
    const offeredLaps = [];
    const docs = new Map([
      [`racingDistricts/${prepared.id}`, prepared.record],
      [`racingLocations/${prepared.locationKey}`, { districtId: prepared.id }],
    ]);
    for (const chunk of prepared.chunks)
      docs.set(raceDistrictChunkPath(prepared.id, chunk.index), chunk.record);
    for (const { id, record } of courses) {
      assert.equal(record.ownerUid, null);
      assert.equal(record.curation.kind, 'reviewed-venue');
      assert.equal(
        record.qualification,
        undefined,
        'Platform content must not fabricate a player qualification receipt',
      );
      docs.set(`racingCourses/${id}`, record);
      const course = await readPublishedRaceCourse({
        id,
        uid: 'another-driver',
        read: async (path) => docs.get(path) || null,
      });
      assert.equal(course.publication.purpose, 'competition');
      assert.equal(racePhysicsVersion(course), record.physicsVersion);
      assert.ok(Math.abs(course.lengthMeters - length) < 2);
      assert.ok([1, 2, 3].includes(course.laps));
      offeredLaps.push(course.laps);
      assert.doesNotThrow(() => assertRaceCourseInDistrict(course, raw.facts));
      const projection = raceCourseProjection(course, id);
      assert.equal(projection.type, 'RaceCourseProjection');
      assert.ok(Buffer.byteLength(JSON.stringify(projection)) < 10000);
      assert.equal(resolveRaceCourseProjection(projection, course, id), course);
      assert.throws(
        () =>
          resolveRaceCourseProjection(
            { ...projection, lengthMeters: projection.lengthMeters + 1 },
            course,
            id,
          ),
        /invalid_race_snapshot/,
      );
      for (const id of ['bmw_m3_e46', 'bmw_m3_e92_race', 'porsche_carrera_4s']) {
        const p = createRaceVehicleProfile(id);
        assert.ok(p.handling.width <= course.vehicleEnvelope.widthMeters);
        assert.ok(p.handling.length <= course.vehicleEnvelope.lengthMeters);
        assert.ok(p.handling.height <= course.vehicleEnvelope.heightMeters);
      }
      if (slug === 'daytona') assert.equal(course.pitLane.course.gates.length, 40);
      if (slug === 'silverstone') {
        assert.equal(course.pitLane.course.gates.length, 73);
        assert.equal(record.curation.nativePitPractice.complete, true);
      }
    }
    assert.deepEqual(offeredLaps, [1, 2, 3]);
  });
}
test('venue content cannot publish a different source, incomplete native journey, missing support or omitted mapped span',async()=>{
 const raw=await input('daytona');
 for(const change of [v=>v.sourceSha256='a'.repeat(64),v=>v.nativePractice.complete=false,v=>v.ground.status='unavailable',v=>v.facts.roads.pop()]){
  const edited=structuredClone(raw);change(edited);await assert.rejects(prepareRacingVenueIntake(edited));
 }
});
test('a separately reconstructed pit cannot inherit acceptance from an older main-loop lap',async()=>{
 const raw=await input('silverstone');delete raw.nativePitPractice;
 await assert.rejects(prepareRacingVenueIntake(raw),/complete native pit journey/);
});
test('the real browser connection resolves the full GP and pit course within the existing buffer budget',async()=>{
 const {prepared,courses}=await prepareRacingVenueIntake(await input('silverstone'));
 const docs=new Map([[`racingDistricts/${prepared.id}`,prepared.record],[`racingLocations/${prepared.locationKey}`,{districtId:prepared.id}]]);
 const {id,record}=courses[0];docs.set(`racingCourses/${id}`,record);
 const course=await readPublishedRaceCourse({id,uid:'one',read:async path=>docs.get(path)||null});
 assert.equal(course.venueSource.id,'silverstone-grand-prix');
 assert.equal(raceCourseProjection({...course,venueSource:undefined,pitLane:undefined,pitPath:undefined},id).type,'RaceCourseProjection','Large unbanked district compatibility stays compact too');
 const service=createRaceServer({origins:['http://127.0.0.1:4000'],authenticate:async ({idToken})=>({uid:idToken,expiresAtMs:Date.now()+60000}),
  store:{course:async()=>course,admit:async()=>({profile:createRaceVehicleProfile('bmw_m3_e92_race'),label:'Driver',leaseUntil:Date.now()+15000}),
   renew:async()=>({leaseUntil:Date.now()+15000}),release:async()=>{},releaseParticipant:async()=>{}}});
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
 const WebSocket=createRequire(new URL('../services/racing/package.json',import.meta.url))('ws'),frames=[],errors=[],connections=[],received=[];
 class BrowserSocket extends WebSocket{constructor(url){super(url,{origin:'http://127.0.0.1:4000'});this.on('message',bytes=>frames.push(bytes.length));}}
 const until=async predicate=>{const end=Date.now()+5000;while(!predicate()){if(Date.now()>end)throw Error('GP projection connection deadline');await new Promise(resolve=>setTimeout(resolve,20));}};
 try{
  for(const uid of ['one','two']){
   const connection=createRaceConnection({uid,endpoint:`ws://127.0.0.1:${service.server.address().port}/race`,expectedCourse:course,physicsVersion:racePhysicsVersion(course),
    credentials:async()=>({idToken:uid,appCheckToken:'controlled'}),join:{roomCode:'GP0001',worldSeed:'controlled',courseId:id,vehicleId:'bmw_m3_e92_race'},
    isCurrent:()=>true,WebSocketClass:BrowserSocket,onSnapshot:(state,resolved)=>{if(resolved)assert.equal(resolved,course);received.push({uid,state});},onError:e=>errors.push(e)});
   connections.push(connection);await connection.connect();await until(()=>connection.connected());
  }
  await until(()=>received.some(r=>r.uid==='one'&&r.state.players.length===2));
  assert.deepEqual(errors,[]);assert.ok(connections.every(c=>c.connected()));assert.ok(Math.max(...frames)<128*1024);
 }finally{try{for(const c of connections)c.stop();}finally{await service.close();}}
});
test('platform publication refuses an existing creator or damaged course before changing any district, pointer or history',async()=>{
 const pack=await prepareRacingVenueIntake(await input('silverstone'));
 for(const change of [r=>r.ownerUid='retained-creator',r=>r.reference.name='Changed source',r=>r.physicsVersion='obsolete']){
  const record=structuredClone(pack.courses[0].record);change(record);
  const rows=new Map([[`racingCourses/${pack.courses[0].id}`,record],['users/preserved',{history:'retained'}]]),before=JSON.stringify([...rows]);
  const db={collection:p=>({doc:id=>({path:p+'/'+id})}),runTransaction:async fn=>{
   const tx={get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)}),create(){throw Error('Unexpected write before conflict check');},set(){throw Error('Unexpected write before conflict check');},update(){throw Error('Unexpected write before conflict check');}};
   return fn(tx);
  }};
  await assert.rejects(publishPreparedRacingDistrict(db,pack.prepared,1,{courses:pack.courses}),/reviewed separately/);
  assert.equal(JSON.stringify([...rows]),before);
 }
});
