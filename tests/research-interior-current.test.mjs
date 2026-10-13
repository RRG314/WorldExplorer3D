import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createResearchDeck} from '../app/js/boat-mode/research/runtime.js';
import {createShipMeshNavigation} from '../app/js/boat-mode/research/mesh-navigation.js';
import {RESEARCH_STATIONS,RESEARCH_DECKS,researchRoomAt,researchRouteGraph} from '../app/js/boat-mode/research/interior-plan.js';
import {createResearchWayfinding} from '../app/js/boat-mode/research/wayfinding.js';
import {consumePlayerProvision} from '../app/js/player/provisions.js';
import {createPlayerConditionModel} from '../app/js/player/condition-model.js';
import {createBackpackModel} from '../app/js/player/backpack-model.js';

test('every functional station belongs to a physical room on the matching deck',()=>{
 for(const station of RESEARCH_STATIONS){assert.equal(researchRoomAt(station).id,station.room,station.id);assert.equal(RESEARCH_DECKS.find(d=>d.id===station.deck).y,station.y);}
 const {nodes,edges}=researchRouteGraph(),seen=new Set(['spawn']);for(let pass=0;pass<nodes.length;pass++)for(const [a,b] of edges){if(seen.has(a))seen.add(b);if(seen.has(b))seen.add(a);}
 assert.ok(RESEARCH_STATIONS.every(s=>seen.has(s.id)));assert.ok(nodes.every(n=>seen.has(n.id)));
});

test('route does not send a player backwards along a clear passage',()=>{
 const navigation={walkableSegment:(a,b)=>Math.abs(a.y-b.y)<.2&&Math.abs(a.x)<.01&&Math.abs(b.x)<.01};
 const wayfinding=createResearchWayfinding(navigation),route=wayfinding.route({x:0,y:1.944,z:-15},'lab');
 assert.ok(route.length>1);assert.ok(route[1].z>=-15,JSON.stringify(route));assert.equal(route.at(-1).id,'lab');
 assert.deepEqual(wayfinding.route({x:0,y:1.944,z:0},'unknown'),[]);
});

test('galley provision consumer shares condition rules, preserves full-health supplies and rejects absent items',()=>{
 const condition=createPlayerConditionModel({storage:{getItem(){return null},setItem(){}}}),inventory=createBackpackModel({items:[{instanceId:'snack',catalogId:'route-snack',quantity:2,metadata:{conditionRestore:.12}}]});
 assert.equal(consumePlayerProvision(inventory,condition,inventory.item('snack')).reason,'full_health');assert.equal(inventory.item('snack').quantity,2);
 condition.set(.5);const item=inventory.item('snack');assert.deepEqual(consumePlayerProvision(inventory,condition,item),{ok:true,condition:.62});assert.equal(inventory.item('snack').quantity,1);
 assert.equal(consumePlayerProvision(inventory,condition,{...item,instanceId:'missing'}).reason,'inventory_unavailable');assert.equal(condition.snapshot().condition,.62);
 assert.equal(consumePlayerProvision(inventory,condition,{...item,metadata:{conditionRestore:Infinity}}).reason,'not_consumable');
});

test('nearby wall and deck boundaries cannot authorize remote lab actions',async()=>{
 globalThis.THREE=THREE;const mesh=new THREE.Group(),host=new THREE.Group();
 const floor=new THREE.Mesh(new THREE.BoxGeometry(20,.2,90),new THREE.MeshBasicMaterial());floor.position.y=1.844;mesh.add(floor);
 const navigation=createShipMeshNavigation(THREE,mesh);Object.assign(mesh.userData,{researchVesselState:'ready',researchNavigation:navigation});
 let actions={},mapChanged,shown,hudCreations=0;const ctx={LOC:{lat:0,lon:0},SCALE:100000,METERS_PER_WORLD_UNIT:1,getEnv:()=> 'EARTH',boat:{x:0,y:0,z:0,speed:0},boatMode:{active:true,transportCatalogId:'ocean-research-vessel',mesh},Walk:{state:{characterMesh:host}},readControlActions:()=>actions};
 const api=createResearchDeck({ctx,resetDynamics(){},updateVessel(){},hudFactory:callbacks=>{hudCreations++;mapChanged=callbacks.mapChanged;return {show(s){shown=s},hide(){},message(){},closeMap(){mapChanged(false)},dispose(){}};}});api.enter();api.update(0);
 // Reach the corridor outside the wet lab using the actual controller. A
 // 2.4 m radius alone would allow the old near-wall case at x=1.1.
 actions={move:1};for(let i=0;i<159;i++)api.update(.05);actions={};
 let p=api.snapshot().pose;actions={strafe:1};for(let i=0;i<18;i++)api.update(.05);actions={};
 assert.ok(api.snapshot().pose.x<1.3);assert.equal(api.stationDistance('lab'),Infinity);assert.equal(await api.act(),false);
 const before=api.snapshot().pose;mapChanged(true);actions={move:1,turn:1};api.update(.05);assert.deepEqual(api.snapshot().pose,before);assert.equal(await api.act(),false);
 api.release();assert.equal(api.snapshot().mapOpen,false);api.dispose();api.update(.1);assert.equal(hudCreations,1);assert.equal(api.enter(),false);navigation.dispose();
});
