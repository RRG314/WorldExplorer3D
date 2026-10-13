import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {MUSEUM_CONTENT} from '../app/js/interiors/museum-catalog.js';
import {validateInteriorContent,matchInteriorBuilding,exhibitJournalEventId} from '../app/js/interiors/content-contract.js';
import {fitGalleryLayout,galleryExhibitPlacements} from '../app/js/interiors/gallery-layout.js';
import {resolveCuratedInterior} from '../app/js/interiors/content-resolver.js';
import {attachGallery,disposeGallery} from '../app/js/interiors/gallery-runtime.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {assertPlayableLayout,compileLayout,containsRegion,roomRing,floorWalls,layoutEntrance} from '../functions/interior-layout.mjs';
import {inspectInteriorGlb,validateImportSource} from '../scripts/import-interior-content.mjs';
import {buildAuthoredInterior} from '../app/js/interiors/authored-geometry.js';
import {finishGalleryArchitecture,releaseGalleryTextures} from '../app/js/interiors/gallery-finishes.js';
import {publishEarthEnvironment} from '../app/js/engine/quality.js';
import {downloadBoundedModel} from '../app/js/assets/bounded-model-download.js';
import {addGalleryFixtures} from '../app/js/interiors/gallery-scene.js';
const content=MUSEUM_CONTENT[0],frame=earthCoordinateFrame({lat:39.29184,lon:-76.61005},100000);
const ring=content.association.footprint.map(p=>frame.toWorld(p.lat,p.lon));
const support=()=>({enterable:true,key:'way/336352958',entryAnchor:{x:(ring[1].x+ring[2].x)/2,z:(ring[1].z+ring[2].z)/2},building:{pts:structuredClone(ring),sourceBuildingId:'way/336352958',buildingPartKind:'full',bodyHeightMeters:8}});
const definition=()=>resolveCuratedInterior({geoToWorld:(lat,lon)=>frame.toWorld(lat,lon),METERS_PER_WORLD_UNIT:1.11},support(),{mode:'generated'});
test('reviewed registry binds canonical building identity AND its actual footprint',()=>{
  validateInteriorContent(content);const s=support();assert.ok(matchInteriorBuilding(content,s,(lat,lon)=>frame.toWorld(lat,lon),1.11));
  s.key='wrong';s.building.sourceBuildingId='wrong';s.label='The Peale';assert.equal(matchInteriorBuilding(content,s,(lat,lon)=>frame.toWorld(lat,lon)),null);
  s.key='way/336352958';s.building.pts=s.building.pts.map(p=>({...p,x:p.x+12}));assert.equal(matchInteriorBuilding(content,s,(lat,lon)=>frame.toWorld(lat,lon)),null);
  const partial=support();partial.building.buildingPartKind='part';assert.equal(matchInteriorBuilding(content,partial,(lat,lon)=>frame.toWorld(lat,lon)),null);
});
test('private captures and mapped indoor plans cannot be replaced by a public gallery',()=>{
  for(const existing of [{accessDenied:true},{communityRealityCapture:{layout:{}}},{mode:'mapped'}])assert.equal(resolveCuratedInterior({},support(),existing),existing);
  const wrong=structuredClone(content);wrong.sources[0].license='CC-BY-NC-4.0';assert.throws(()=>validateInteriorContent(wrong),/rights/);
  wrong.sources[0].license='CC0-1.0';wrong.review.status='pending';assert.throws(()=>validateInteriorContent(wrong),/unreviewed/);
});

test('aquarium and untyped content cannot enter the museum layout, renderer or asset lifecycle',async()=>{
  for(const venueType of ['aquarium',undefined]){
    const other={...content,venueType};
    assert.throws(()=>validateInteriorContent(other),/museum venue type/);
    const existing={mode:'generated'};
    assert.equal(resolveCuratedInterior({geoToWorld:(lat,lon)=>frame.toWorld(lat,lon)},support(),existing,[other]),existing);
    assert.equal(matchInteriorBuilding(other,support(),(lat,lon)=>frame.toWorld(lat,lon)),null);
    const {ctx,active}=runtime();active.definition.curatedContent=other;
    ctx.camera=new T.PerspectiveCamera();ctx.camera.layers.enable(4);ctx.sun=new T.DirectionalLight();
    const mask=ctx.camera.layers.mask;
    let requests=0;
    addGalleryFixtures(T,{group:active.group},{curatedContent:other},()=>assert.fail('Museum collision was added'));
    await attachGallery(ctx,T,active,{load:async()=>{requests++;throw Error('Wrong venue asset request');}});
    assert.equal(requests,0);assert.equal(active.group.children.length,0);assert.equal(active.gallery,undefined);
    assert.equal(ctx.camera.layers.mask,mask);assert.equal(ctx.sun.visible,true);
  }
});
test('concave mapped Peale supports two galleries off an entrance hall with safe exhibit placements',()=>{
  const layout=definition().authoredLayout;assert.ok(layout);assert.equal(assertPlayableLayout(layout),true);assert.equal(layout.floors[0].rooms.length,3);
  const placements=galleryExhibitPlacements(layout,content.exhibits);assert.equal(placements.length,3);
  const center={x:ring.reduce((n,p)=>n+p.x,0)/ring.length,z:ring.reduce((n,p)=>n+p.z,0)/ring.length};
  for(const room of layout.floors[0].rooms)assert.ok(containsRegion(ring,roomRing(layout.floors[0],room).map(p=>({x:p.x+center.x,z:p.z+center.z}))));
  const compiled=compileLayout(layout);assert.ok(compiled.solids.length>0);assert.equal(layout.floors[0].doors.filter(d=>d.entry).length,1);
  assert.equal(fitGalleryLayout({footprint:[{x:0,z:0},{x:4,z:0},{x:4,z:4},{x:0,z:4}],heightMeters:4},{x:0,z:2},'small'),null);
  assert.equal(fitGalleryLayout({footprint:ring,heightMeters:1},{...ring[0]},'low'),null);
});
test('all imported source paths and actual emitted GLBs are pinned, bounded, local and self contained',async()=>{
  const sources=JSON.parse(await readFile('config/interior-imports.json','utf8')).sources;
  const output=JSON.parse(await readFile('app/assets/models/interiors/museum/asset-manifest.json','utf8'));
  assert.equal(new Set(sources.map(s=>s.kind)).size,2);
  for(const source of sources)validateImportSource(source);
  assert.throws(()=>validateImportSource({...sources[0],url:'https://untrusted.example/model.glb'}),/host/);
  assert.throws(()=>validateImportSource({...sources[0],id:'../../model'}),/identity/);
  for(const record of output.records)for(const tier of record.tiers){
    const bytes=await readFile(`app/assets/models/interiors/museum/${tier.file}`),json=inspectInteriorGlb(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),tier.sha256);assert.ok(bytes.length<=record.maxOutputBytes);assert.ok(tier.triangles<=record.triangles);assert.equal(json.scenes.length,1);
  }
  const hostile={asset:{version:'2.0'},buffers:[{uri:'https://secret.example/anything'}]},json=Buffer.from(JSON.stringify(hostile).padEnd(Math.ceil(JSON.stringify(hostile).length/4)*4));
  const bytes=Buffer.alloc(20+json.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  assert.throws(()=>inspectInteriorGlb(bytes),/resources/);
});
test('bounded runtime download rejects oversized, non-GLB and stalled responses',async()=>{
  await assert.rejects(downloadBoundedModel('/asset',{maxBytes:20,fetchImpl:async()=>new Response('bad')}),/GLB/);
  await assert.rejects(downloadBoundedModel('/asset',{maxBytes:20,fetchImpl:async()=>new Response(new Uint8Array(21))}),/budget/);
  await assert.rejects(downloadBoundedModel('/asset',{maxBytes:20,timeoutMs:5,fetchImpl:async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),/aborted/);
});
function runtime(){const ctx={_worldLoadSequence:1,LOC:{lat:39.29184,lon:-76.61005},METERS_PER_WORLD_UNIT:1.11,discoveryProfileStore:{getEventsById:async()=>[],recordExplorerEvent:async e=>({event:e,recorded:true})}};const active={definition:definition(),group:new T.Group(),outsideWorldSequence:1};ctx.activeInterior=active;return{ctx,active};}
test('exit during a delayed exhibit load releases the late lease without attaching or starting more requests',async()=>{
  const {ctx,active}=runtime();let finish,loads=0,disposed=0;
  const pending=attachGallery(ctx,T,active,{load:()=>{loads++;return new Promise(resolve=>finish=resolve);}});
  disposeGallery(ctx,active);ctx.activeInterior=null;finish({root:new T.Group(),dispose(){disposed++;}});await pending;
  assert.equal(disposed,1);assert.equal(loads,1);assert.equal(active.group.children.length,0);assert.equal(active.gallery,null);
});
test('failed display retries, durable Journal identity and repeated exit use the original owners',async()=>{
  const {ctx,active}=runtime();let fail=true,disposed=0;const records=new Map();ctx.discoveryProfileStore.recordExplorerEvent=async e=>{records.set(e.eventId,e);return{recorded:true,event:e};};
  const load=async()=>{if(fail){fail=false;throw Error('offline');}const root=new T.Group();return{root,dispose(){root.parent?.remove(root);disposed++;}};};
  await attachGallery(ctx,T,active,{load});assert.equal(active.gallery.exhibits.get('triceratops').status,'unavailable');
  await active.gallery.loadExhibit('triceratops');assert.equal(active.gallery.exhibits.get('triceratops').status,'ready');
  await active.gallery.save('triceratops');await active.gallery.save('triceratops');assert.equal(records.size,1);
  const event=[...records.values()][0];assert.equal(event.eventId,exhibitJournalEventId(content.id,'triceratops'));assert.equal(event.projections.profile,false);assert.equal(event.projections.fieldGuide,false);
  disposeGallery(ctx,active);disposeGallery(ctx,active);assert.equal(disposed,3);assert.equal(active.group.children.length,0);
  ctx.discoveryProfileStore.getEventsById=async()=>[...records.values()];await attachGallery(ctx,T,active,{load});assert.ok(active.gallery.saved.has('triceratops'));disposeGallery(ctx,active);assert.equal(disposed,6);
});

test('museum finish batches preserve open door clearance and release late texture loads',()=>{
  const layout=definition().authoredLayout,{group}=buildAuthoredInterior(T,layout);let loaded,disposals=0;
  const texture=new T.Texture();texture.addEventListener('dispose',()=>disposals++);
  finishGalleryArchitecture({...T,TextureLoader:class{load(_url,ready){loaded=ready;return texture;}}},group,layout);
  const surfaces=group.children.filter(o=>o.userData.kind==='floor');assert.ok(surfaces.length===3&&surfaces.every(o=>o.material.map===texture));
  const batches=group.children.filter(o=>o.isInstancedMesh);assert.ok(batches.length>0&&batches.length<=6);
  // Body-height passage samples are clear in the visible joinery as well as
  // the layout's physical walls. Jambs cannot eat into the usable opening.
  for(const door of layout.floors[0].doors){
    const w=floorWalls(layout.floors[0]).find(w=>w.id===door.wall),l=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z);
    for(const offset of [-.4,0,.4]){
      const p=new T.Vector3(w.a.x+(w.b.x-w.a.x)*(door.offset+offset)/l,1.4,w.a.z+(w.b.z-w.a.z)*(door.offset+offset)/l);
      for(const batch of batches)for(let i=0;i<batch.count;i++){const matrix=new T.Matrix4();batch.getMatrixAt(i,matrix);const local=p.clone().applyMatrix4(matrix.invert());assert.ok(Math.abs(local.x)>.501||Math.abs(local.y)>.501||Math.abs(local.z)>.501,'decorative joinery blocks a doorway');}
    }
  }
  releaseGalleryTextures(group);assert.equal(disposals,1);loaded(texture);assert.equal(disposals,2);releaseGalleryTextures(group);assert.equal(disposals,2);
});
test('front-gallery profile retains the same entrance/room relationships under rotation',()=>{
  const center={x:ring.reduce((n,p)=>n+p.x,0)/ring.length,z:ring.reduce((n,p)=>n+p.z,0)/ring.length},entry=support().entryAnchor;
  for(const yaw of [0,.45,1.2,2.9]){
    const rotate=p=>({x:(p.x-center.x)*Math.cos(yaw)-(p.z-center.z)*Math.sin(yaw),z:(p.x-center.x)*Math.sin(yaw)+(p.z-center.z)*Math.cos(yaw)});
    const envelope={footprint:ring.map(rotate),heightMeters:8},layout=fitGalleryLayout(envelope,rotate(entry),'rotated','peale-front-ground-v1');
    assert.ok(layout);assert.equal(assertPlayableLayout(layout),true);const entrance=layoutEntrance(layout);assert.equal(entrance.room.type,'hall');assert.equal(layout.floors[0].rooms.filter(r=>r.type==='gallery').length,2);
    const hall=entrance.room.id;for(const door of layout.floors[0].doors.filter(d=>!d.entry))assert.ok(floorWalls(layout.floors[0]).find(w=>w.id===door.wall).rooms.includes(hall));
  }
});

test('gallery lighting restores current outdoor lights after exit, including failed loading',async()=>{
  const {ctx,active}=runtime();ctx.sun=new T.DirectionalLight(0xffffff,1);ctx.hemiLight=new T.HemisphereLight();ctx.hemiLight.visible=false;
  let release;const task=attachGallery(ctx,T,active,{load:()=>new Promise((_,reject)=>release=reject)});
  assert.equal(ctx.sun.visible,false);ctx.sun.intensity=.15;ctx.sun.color.setHex(0x929ef0);
  disposeGallery(ctx,active);release(new Error('cancelled'));await task;
  assert.equal(ctx.sun.visible,true);assert.equal(ctx.hemiLight.visible,false);assert.equal(ctx.sun.intensity,.15);assert.equal(ctx.sun.color.getHex(),0x929ef0);
});

test('a sealed gallery excludes outdoor geometry from its camera and restores the previous layer mask',async()=>{
  const {ctx,active}=runtime();ctx.camera=new T.PerspectiveCamera();ctx.camera.layers.enable(4);const mask=ctx.camera.layers.mask;
  const outside=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),inside=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());active.group.add(inside);
  await attachGallery(ctx,T,active,{load:async()=>({root:new T.Group(),dispose(){}})});
  assert.equal(ctx.camera.layers.test(outside.layers),false);assert.equal(outside.visible,true);assert.equal(outside.layers.mask,1);
  assert.equal(ctx.camera.layers.test(inside.layers),true);
  for(const exhibit of active.gallery.exhibits.values())assert.equal(ctx.camera.layers.test(exhibit.instance.root.layers),true);
  disposeGallery(ctx,active);assert.equal(ctx.camera.layers.mask,mask);assert.equal(ctx.camera.layers.test(outside.layers),true);
  outside.geometry.dispose();outside.material.dispose();inside.geometry.dispose();inside.material.dispose();
});

test('venue shadow cameras include interior objects and publish late models with automatic shadows disabled',async()=>{
  const {ctx,active}=runtime();ctx.camera=new T.PerspectiveCamera();ctx.renderer={shadowMap:{enabled:true,autoUpdate:false,needsUpdate:false}};
  const spot=new T.SpotLight();spot.castShadow=true;active.group.add(spot);
  let resolveFirst,loads=0;
  const instance=()=>({root:new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial()),dispose(){this.root.geometry.dispose();this.root.material.dispose();this.root.parent?.remove(this.root);}});
  const task=attachGallery(ctx,T,active,{load:()=>++loads===1?new Promise(r=>resolveFirst=r):Promise.resolve(instance())});
  assert.equal(ctx.renderer.shadowMap.needsUpdate,true);
  assert.equal(spot.shadow.camera.layers.mask,ctx.camera.layers.mask);
  ctx.renderer.shadowMap.needsUpdate=false;
  resolveFirst(instance());await task;
  for(const e of active.gallery.exhibits.values())assert.equal(spot.shadow.camera.layers.test(e.instance.root.layers),true);
  assert.equal(ctx.renderer.shadowMap.needsUpdate,true,'a decoded exhibit must invalidate the already-published shadow map');
  ctx.renderer.shadowMap.needsUpdate=false;disposeGallery(ctx,active);
  assert.equal(ctx.renderer.shadowMap.needsUpdate,true,'returning outside requests a current outdoor shadow map');
  assert.equal(ctx.renderer.shadowMap.autoUpdate,false,'the existing renderer scheduling policy stays in charge');
});


test('sealed venue lighting excludes outdoor IBL while weather updates retain the current environment for exit',async()=>{
 for(const venue of ['gallery','aquarium']){
  const {ctx,active}=runtime();ctx.scene=new T.Scene();ctx.scene.environment=new T.Texture();ctx.earthEnvironmentMap=ctx.scene.environment;
  const previous=ctx.scene.environment,next=new T.Texture();
  await attachGallery(ctx,T,active,{load:async()=>({root:new T.Group(),dispose(){}})});
  assert.equal(ctx.scene.environment,null,'outdoor sky must not wash out indoor materials');
  const state=active.gallery;if(venue==='aquarium'){active.gallery=null;active.aquarium=state;}
  publishEarthEnvironment({appCtx:ctx},next);
  assert.equal(ctx.earthEnvironmentMap,next);assert.equal(ctx.scene.environment,null,'live weather cannot republish outdoor IBL through sealed walls');
  if(venue==='aquarium'){active.gallery=state;delete active.aquarium;}
  disposeGallery(ctx,active);ctx.activeInterior=null;
  assert.equal(ctx.scene.environment,next,'exit uses current outdoor lighting, not a stale or disposed capture');
  publishEarthEnvironment({appCtx:ctx},null);assert.equal(ctx.scene.environment,null);
  previous.dispose();next.dispose();
 }
});
