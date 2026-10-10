import {ctx} from '../app/js/shared-context.js?v=55';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {createWalkingPhysicsHelpers} from '../app/js/walking/physics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeWorkspace,transitionWorkspace,validateWorkspacePlacement,findWorkspacePlacement,workspaceGeometry,workspaceCollisionProxies} from '../app/js/campaign/personal-workspace.js';
import {homeAchievementEvent,homeAchievementBadges} from '../app/js/campaign/home-achievements.js';
import {createHousingModel} from '../app/js/real-estate/housing-model.js';
import {createLocalBackpackStore} from '../app/js/player/backpack-store.js';
import {createEquipmentInventory} from '../app/js/urban-sandbox/equipment-model.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {validateJournalBackup} from '../app/js/discovery/backup-validation.js';

const room={center:{x:0,z:0},floorBaseY:0,activeLevel:0,entryPoint:{x:0,z:-3.5},usableFootprint:[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}]};
function makeModel(){const values=new Map();let fail=false;const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);}};
  const backpackStore=createLocalBackpackStore(storage),inventory=createEquipmentInventory();
  const housing=createHousingModel({storage,backpackStore,inventory,getActiveLocationId:()=> 'test',getActorPosition:()=>({x:0,z:0})});
  return {storage,backpackStore,inventory,housing,deny:v=>{fail=v;}};
}
const candidate={id:'home:test:way:42',sourceBuildingId:'way:42',mappedResidential:true,sharedEligible:true,locationId:'test',locationLabel:'Test',price:100000,x:0,z:0};
function completeWorkspace(){let w=normalizeWorkspace();w=transitionWorkspace(w,{type:'place',purpose:'journal',pose:{x:0,z:0,turn:0},revision:w.revision},1);
  w=transitionWorkspace(w,{type:'place',purpose:'journal',pose:{x:0,z:0,turn:1},revision:w.revision},2);
  w=transitionWorkspace(w,{type:'undo',revision:w.revision},3);return transitionWorkspace(w,{type:'use',revision:w.revision},4);}

test('furniture admission keeps real scale, walls, entrance and the whole walking corridor clear',()=>{
  const pose=findWorkspacePlacement(room);assert.ok(pose);assert.equal(validateWorkspacePlacement(room,pose).ok,true);
  assert.equal(validateWorkspacePlacement(room,{x:4,z:0,turn:0}).ok,false);
  assert.match(validateWorkspacePlacement(room,{x:0,z:-3,turn:0}).reason,/entrance|walls/);
  assert.equal(validateWorkspacePlacement(room,pose,[{minX:-4,maxX:4,minZ:-2,maxZ:-1.9,minY:0,maxY:3}]).ok,false);
  assert.equal(validateWorkspacePlacement({...room,activeLevel:1},pose).ok,false);
  assert.equal(validateWorkspacePlacement(room,{x:NaN,z:0,turn:0}).ok,false);
  const tiny={...room,usableFootprint:[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]};assert.equal(findWorkspacePlacement(tiny),null);
});
test('Maker requires rotation, undo and actual use; changing or undoing the arrangement invalidates its current use',()=>{
  let w=normalizeWorkspace();assert.throws(()=>transitionWorkspace(w,{type:'use',revision:0}),/Place/);
  w=completeWorkspace();assert.ok(w.rotated&&w.undone&&w.usedAt);assert.equal(w.pose.turn,0);
  assert.throws(()=>transitionWorkspace(w,{type:'undo',revision:0}),/changed/);
  w=transitionWorkspace(w,{type:'undo',revision:w.revision});assert.equal(w.pose,null);assert.equal(w.usedAt,0);
  assert.throws(()=>transitionWorkspace(w,{type:'use',revision:w.revision}),/Place/);
  assert.throws(()=>transitionWorkspace({schemaVersion:99},{type:'place',revision:0}),/newer/);
});
test('one personal workspace is durable, cannot be resold and does not mint money',()=>{
  const f=makeModel();f.deny(true);assert.equal(f.housing.claimStarter(candidate).ok,false);assert.equal(f.housing.snapshot().homes.length,0);
  f.deny(false);assert.equal(f.housing.claimStarter(candidate).ok,true);assert.equal(f.housing.claimStarter({...candidate,id:'b'}).reason,'starter_already_claimed');
  assert.equal(f.housing.sell(candidate.id).reason,'personal_home_not_for_sale');assert.equal(f.backpackStore.loadCommerce(),null);
  const next=createHousingModel({storage:f.storage,backpackStore:createLocalBackpackStore(f.storage)});
  assert.equal(next.snapshot().starterHomeId,candidate.id);assert.equal(next.snapshot().homes[0].personalStarter,true);
});
test('workspace save failure leaves placement unchanged and old home handles cannot delete newer work',()=>{
  const f=makeModel();f.housing.claimStarter(candidate);
  const old=createHousingModel({backpackStore:f.backpackStore,inventory:f.inventory});
  const cmd={type:'place',purpose:'journal',pose:{x:0,z:0,turn:0},revision:0};
  f.deny(true);assert.equal(f.housing.updateWorkspace(candidate.id,cmd).ok,false);assert.equal(f.housing.snapshot().homes[0].workspace,null);
  f.deny(false);assert.equal(f.housing.updateWorkspace(candidate.id,cmd).ok,true);
  assert.equal(old.setPrimary(candidate.id).ok,false);
  assert.equal(f.backpackStore.loadHousing().homes[0].workspace.pose.turn,0);
});
test('home return receipt requires the completed introduction, a branch and actual recorded home steps',()=>{
  const profile={openingChapter:{phase:'complete'}},home={...candidate,workspace:completeWorkspace(),journey:{entered:1,displayed:2,departed:3,returned:4}};
  assert.equal(homeAchievementEvent('maker',home,profile).points,0);
  assert.throws(()=>homeAchievementEvent('home',home,profile),/steps/);
  assert.equal(homeAchievementEvent('home',home,{...profile,homeAchievements:{maker:{}}}).metadata.homeId,home.id);
  assert.throws(()=>homeAchievementEvent('maker',home,{}),/First Bearings/);
  assert.throws(()=>homeAchievementEvent('home',{...home,journey:{entered:1}},{...profile,threeViews:{phase:'complete'}}),/steps/);
});
test('Maker and Home completion persist one receipt and badge with no points or money grant',async()=>{
  const store=createMemoryDiscoveryProfileStore({profile:{openingChapter:{schemaVersion:1,phase:'complete',acceptedAt:1,regionId:'test',regionLabel:'Test',eventId:'field-record',completedAt:2}}});
  // The memory profile normalizer derives the phase from a saved evidence id.
  const home={...candidate,workspace:completeWorkspace(),journey:{entered:1,displayed:2,departed:3,returned:4}};
  const first=await store.recordHomeAchievement('maker',home);assert.deepEqual(await store.recordHomeAchievement('maker',home),first);
  await store.recordHomeAchievement('home',home);const profile=await store.getProfile();
  assert.deepEqual(homeAchievementBadges(profile).map(b=>b.id),['useful-place','place-to-return']);
  const events=await store.listEvents(100);assert.equal(events.filter(e=>e.eventType==='campaign-completed').length,2);assert.ok(events.every(e=>e.progress.points===0));
});
test('home badge imports require their matching retained event',()=>{
  const home={...candidate,workspace:completeWorkspace()},event=homeAchievementEvent('maker',home,{openingChapter:{phase:'complete'}});
  const backup={profile:{homeAchievements:{maker:event}},events:[event],fieldGuide:[],items:[],companions:[]};
  assert.doesNotThrow(()=>validateJournalBackup(backup));
  assert.throws(()=>validateJournalBackup({...backup,events:[]}),/incomplete/);
});
test('licensed furniture is self-contained, matches hashes and retains modest mesh and texture budgets',()=>{
  const root='app/assets/models/interiors/personal-workspace/',manifest=JSON.parse(readFileSync(root+'PROVENANCE.json'));
  for(const asset of manifest.assets){const bytes=readFileSync(root+asset.id+'.glb');assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(bytes.length<500000);assert.ok(asset.triangles<6000);assert.equal(asset.license,'CC0-1.0');
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.ok(gltf.images.every(i=>i.bufferView!==undefined));assert.ok(gltf.buffers.every(b=>!b.uri));}
});

test('presentation snapshots cannot mutate saved placement or visit evidence',()=>{
  const f=makeModel();f.housing.claimStarter(candidate);
  f.housing.updateWorkspace(candidate.id,{type:'place',purpose:'journal',pose:{x:0,z:0,turn:0},revision:0});
  const view=f.housing.snapshot().homes[0];view.workspace.pose.x=99;view.journey.returned=1;
  const current=f.housing.snapshot().homes[0];assert.equal(current.workspace.pose.x,0);assert.equal(current.journey.returned,undefined);
  assert.equal(f.backpackStore.loadHousing().homes[0].workspace.pose.x,0);
});

for(const shared of [true,false])test(`actual walking physics stops at the desk without promoting it to a roof (${shared?'shared':'fallback'} query)`,()=>{
  const saved={...ctx};
  try{
    const geometry=workspaceGeometry(room,{x:0,z:0,turn:0}),colliders=workspaceCollisionProxies(geometry);
    Object.assign(ctx,{activeInterior:{...room,floorPlan:{storyHeight:3.4}},readControlActions:()=>({move:1}),getBuildTopSurfaceAtWorldXZ:undefined});
    ctx.checkBuildingCollision=shared?createBuildingCollisionQuery({dynamicBuildingColliders:colliders}):undefined;
    const state={walker:{x:geometry.use.x,z:geometry.use.z,y:geometry.use.y+1.7,yaw:Math.PI/2,angle:Math.PI/2,pitch:0,lookYawOffset:0,vy:0,wallJumpTimer:0}};
    const physics=createWalkingPhysicsHelpers({CFG:{eyeHeight:1.7,walkSpeed:2.8,runSpeed:5.6,turnSpeed:2.6,blockStepHeight:.65},state,getWalkGroundY:()=>0,getBuildingsArray:()=>colliders,keys:{}});
    for(let i=0;i<100;i++)physics.updateWalkPhysics(.02,(v,f)=>Number.isFinite(v)?v:f);
    assert.ok(state.walker.x>geometry.use.x,'Player approaches the desk');
    assert.ok(state.walker.x<geometry.parts[0].minX-.2,'Desk stops the player before visual overlap');
    assert.ok(state.walker.y<1.75,'Furniture is not a roof surface');
    physics.disposeWater();
  }finally{for(const key of Object.keys(ctx))delete ctx[key];Object.assign(ctx,saved);}
});
