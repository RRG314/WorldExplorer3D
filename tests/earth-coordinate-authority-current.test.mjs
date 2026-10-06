import test from 'node:test';
import assert from 'node:assert/strict';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js?v=1';
import {earthLocalToGeographic} from '../app/js/earth-core/location-origin.js?v=1';
import {geoToWorld,worldToGeo} from '../app/js/config.js';
import {worldToGeo as interiorGeographic} from '../app/js/interiors/core.js';
import {ctx} from '../app/js/shared-context.js?v=55';

test('existing district coordinates keep their scale and caller-owned output',()=>{
 for(const lat of [0,39.2904,-33.8,83.99]){
  const origin={lat,lon:12},frame=earthCoordinateFrame(origin,100000);
  for(const [x,z] of [[0,0],[1800,2000],[-20000,-8000]]){
   const old={lat:lat-z/100000,lon:12+x/(100000*Math.cos(lat*Math.PI/180))},out={};
   assert.equal(frame.toGeographic(x,z,out),out);assert.deepEqual(out,old);
   const back=frame.toWorld(out.lat,out.lon);assert.ok(Math.abs(back.x-x)<1e-7&&Math.abs(back.z-z)<1e-7);
  }
 }
});

test('both dateline directions use adjacent geographic positions, not a globe-wide displacement',()=>{
 for(const sign of [-1,1]){
  const frame=earthCoordinateFrame({lat:10,lon:sign*179.999},100000);
  const world=frame.toWorld(10,-sign*179.999);assert.ok(Math.abs(world.x)<2000);
  const back=frame.toGeographic(world.x,world.z);assert.ok(Math.abs(back.lon+sign*179.999)<1e-9);
 }
});

test('map/scene, interiors and marine records use the same accepted frame including both poles',()=>{
 const previous=ctx.LOC;
 try{
  for(const lat of [39.29,84,89.9,90,-90]){
   ctx.LOC={lat,lon:25};
   for(const [x,z]of [[0,0],[1200,900],[-4000,6000]]){
    const expected=worldToGeo(x,z);
    assert.ok(Number.isFinite(expected.lat)&&Number.isFinite(expected.lon));
    assert.deepEqual(interiorGeographic(x,z),expected);
    assert.deepEqual(earthLocalToGeographic(ctx.LOC,ctx.SCALE,x,z),expected);
    assert.deepEqual(geoToWorld(expected.lat,expected.lon),earthCoordinateFrame(ctx.LOC,ctx.SCALE).toWorld(expected.lat,expected.lon));
   }
  }
 }finally{ctx.LOC=previous;}
});

test('frame snapshots do not drift when a location object changes and invalid coordinates stay unavailable',()=>{
 const origin={lat:10,lon:12},first=earthCoordinateFrame(origin,100000);
 origin.lat=20;const second=earthCoordinateFrame(origin,100000);assert.notEqual(first,second);
 assert.deepEqual(first.toGeographic(0,0),{lat:10,lon:12});
 assert.deepEqual(first.toGeographic(NaN,0),{lat:null,lon:null});
 assert.deepEqual(first.toWorld(91,0),{x:null,z:null});
 assert.throws(()=>earthCoordinateFrame({lat:91,lon:0},100000),TypeError);
});
