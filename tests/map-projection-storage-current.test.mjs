import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {worldToGeo,geoToWorld} from '../app/js/config.js';
import {resolveMapView,worldToLatLon} from '../app/js/map/tiles.js';
import {drawEarthBaseLayers} from '../app/js/map/earth-base.js';
import {drawEarthMarkerLayers} from '../app/js/map/earth-markers.js';

test('caller-owned geographic and screen outputs preserve independent legacy results and polar authority',()=>{
 const original=ctx.LOC;
 try{
  for(const lat of [0,39.2904,-33.8,83.99,84,89,-89]){
   ctx.LOC={lat,lon:12};ctx.car={x:0,z:0};ctx.minimapZoom=15;ctx.largeMapZoom=14;
   const result={},screen={};const view=resolveMapView(150,150,false);
   assert.deepEqual(view.worldToScreen(0,0),{x:75,y:75});
   for(let i=0;i<1000;i++){
    const x=(i-500)*3.1,z=Math.sin(i)*1000;
    const expected=worldToGeo(x,z),independent=worldToGeo(x+30,z+30);
    assert.notEqual(expected,independent);assert.equal(worldToGeo(x,z,result),result);assert.deepEqual(result,expected);
    assert.equal(worldToLatLon(x,z,result),result);assert.deepEqual(result,expected);
    const projected=view.worldToScreen(x,z);assert.equal(view.worldToScreen(x,z,screen),screen);assert.deepEqual(screen,projected);
    view.worldToScreen(x+30,z+30,screen);assert.notDeepEqual(screen,projected);
    if(Math.abs(lat)<84){const back=geoToWorld(expected.lat,expected.lon);assert.ok(Math.abs(back.x-x)<1e-8&&Math.abs(back.z-z)<1e-8);}
   }
  }
 }finally{ctx.LOC=original;}
});

test('water and POI painters use bounded projection destinations without changing any canvas command',()=>{
 const image=globalThis.Image;globalThis.Image=class{set src(_) {}};
 const original=ctx.LOC;
 Object.assign(ctx,{LOC:{lat:39.2904,lon:-76.6122},car:{x:0,z:0},minimapZoom:15,largeMapZoom:14,mapLayers:{},linearFeatures:[],roads:[],customTrack:[],checkpoints:[],gameMode:'free',showPOIs:{},isPOIVisible:()=>true,
  waterAreas:[{pts:[{x:-20,z:0},{x:10,z:30},{x:20,z:0}]}],waterways:[{pts:[{x:-80,z:0},{x:0,z:-20},{x:70,z:60}],width:4}],
  pois:Array.from({length:100},(_,i)=>({x:i-50,z:i%7,type:'fixture',icon:'X',color:0x223344}))});
 try{
  for(const isLarge of [false,true]){
   const size=isLarge?800:150,view=resolveMapView(size,size,isLarge),destinations=new Set();let reuseCalls=0;
   const paint=reuse=>{
    const commands=[],canvas=new Proxy({}, {get:(_,key)=>(...args)=>commands.push([key,...args]),set:(_,key,value)=>{commands.push(['set',key,value]);return true;}});
    const project=(x,z,out)=>{
     if(reuse&&out){destinations.add(out);reuseCalls++;return view.worldToScreen(x,z,out);}
     return view.worldToScreen(x,z);
    };
    const current={...view,worldToScreen:project};drawEarthBaseLayers(canvas,size,size,isLarge,current);drawEarthMarkerLayers(canvas,size,size,isLarge,current);return commands;
   };
   assert.deepEqual(paint(true),paint(false));assert.equal(reuseCalls,106);assert.equal(destinations.size,2);
  }
 }finally{ctx.LOC=original;globalThis.Image=image;}
});
